#!/usr/bin/env node
/**
 * check-alpha.mjs —— 验证「透明素材」是不是真的透明
 *
 * 用法：
 *   node scripts/check-alpha.mjs 产物-alpha.mov
 *   node scripts/check-alpha.mjs <目录>                    # 目录下所有 .mov/.png/.webm
 *   node scripts/check-alpha.mjs a.mov b.png
 *   node scripts/check-alpha.mjs 产物-alpha.mov --samples 20
 *
 * 为什么需要这个脚本：
 *   `ffprobe` 报 `pix_fmt=yuva444p10le` **只说明有 alpha 平面**，
 *   不说明平面里有内容 —— 假 alpha（全 255）同样是 yuva444p10le。
 *   唯一可靠的判据是把 alpha 平面抽出来看像素分布。
 *
 * ★ 按时间点抽样，不解全片。
 *   alpha 平面抽成 rawvideo 是 gray8，1080x1440 每帧 1.48MB。
 *   一条 30s / 25fps 的素材 = 750 帧 = 1.1GB，塞进 spawn 缓冲直接爆，
 *   报出来却像「透明不合格」—— 典型的安静误报（比这个 bug 本身更贵）。
 *   改为均匀抽 12 个时间点：秒级完成，判据完全不变。
 *
 * 头号失败原因：
 *   headless 浏览器默认给页面铺不透明白底。截图时若没传
 *   `--default-background-color=00000000`，PNG 连 alpha 通道都没有（colorType=2），
 *   后面怎么编都只是给白底图贴了个全 255 的假 alpha。
 *
 * 退出码：0 = 全部合格；1 = 有不合格项
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/* ---------- 参数 ---------- */
const raw = process.argv.slice(2);
const inputs = [];
let SAMPLES = 12;
for (let i = 0; i < raw.length; i++) {
  if (raw[i] === "--samples") { SAMPLES = Math.max(1, Number(raw[++i]) || 12); continue; }
  if (raw[i].startsWith("--")) continue;
  inputs.push(raw[i]);
}
if (!inputs.length) {
  console.error("用法: node scripts/check-alpha.mjs <文件或目录> [...] [--samples N]");
  process.exit(1);
}

/* ---------- ffmpeg / ffprobe ---------- */
const FF = process.env.IVH_FFMPEG || [
  "C:/Users/mydfy/Developer/ffmpeg-8.1.1-full/ffmpeg-8.1.1-essentials_build/bin/ffmpeg.exe",
  "C:/ffmpeg/bin/ffmpeg.exe",
  "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg",
].find(p => fs.existsSync(p)) || "ffmpeg";

/* ffprobe 通常与 ffmpeg 同目录，不一定在 PATH 里 —— 顺着 ffmpeg 的位置找 */
const PROBE = (() => {
  if (process.env.IVH_FFPROBE) return process.env.IVH_FFPROBE;
  if (FF !== "ffmpeg") {
    const d = path.dirname(FF), ext = path.extname(FF);
    const c = path.join(d, "ffprobe" + ext);
    if (fs.existsSync(c)) return c;
  }
  return "ffprobe";
})();

const MEDIA = /\.(png|mov|webm|mkv|mp4|gif|apng)$/i;
const fwd = p => p.replace(/\\/g, "/");
const pct = v => (100 * v).toFixed(2).padStart(6) + "%";

const files = [];
for (const a of inputs) {
  if (!fs.existsSync(a)) { console.error(`跳过（不存在）：${a}`); continue; }
  if (fs.statSync(a).isDirectory()) {
    for (const f of fs.readdirSync(a)) if (MEDIA.test(f)) files.push(path.join(a, f));
  } else files.push(a);
}

/* ---------- 探测尺寸与时长（算抽样间隔用） ---------- */
function probeVideo(file) {
  const r = spawnSync(PROBE, ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json", fwd(file)], { encoding: "utf8", timeout: 30000 });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    const j = JSON.parse(r.stdout);
    const s = (j.streams || [])[0] || {};
    return { w: +s.width || 0, h: +s.height || 0, dur: +((j.format || {}).duration || 0) };
  } catch { return null; }
}

/** PNG 的 colorType 直接读 IHDR 字节，不解压 —— 最快判定「有没有 alpha 通道」 */
function pngHeader(file) {
  const b = fs.readFileSync(file);
  if (b.length < 26 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { ct: b[25], w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const CT_NAME = { 0: "灰度", 2: "RGB（无 alpha）", 3: "索引（无 alpha）", 4: "灰度+alpha", 6: "RGBA（有 alpha）" };

/* ---------- 抽 alpha 平面 ----------
   interval = 0 → 全量（只对单张 PNG 用）
   interval > 0 → 每 interval 秒留一帧（select 表达式取 ffmpeg 官方写法，
                  首帧用 isnan(prev_selected_t) 单独命中，否则第一帧永远选不上） */
function alphaFrames(file, interval, frameSize) {
  const sel = interval > 0
    ? `alphaextract,select='isnan(prev_selected_t)+gte(t-prev_selected_t\\,${interval.toFixed(3)})'`
    : "alphaextract";
  const args = ["-v", "error", "-i", fwd(file), "-vf", sel];
  if (interval > 0) args.push("-vsync", "0");
  args.push("-f", "rawvideo", "-pix_fmt", "gray", "-");

  const r = spawnSync(FF, args, { maxBuffer: 1 << 27 });
  if (r.error) return { err: r.error.message };
  if (!r.stdout || !r.stdout.length) {
    return { err: (r.stderr || Buffer.from("")).toString().trim().split("\n")[0] || "取不到 alpha 平面" };
  }
  const a = r.stdout;
  const size = frameSize > 0 ? frameSize : a.length;
  const out = [];
  for (let off = 0; off + size <= a.length; off += size) {
    let n0 = 0, n255 = 0, mid = 0, sum = 0;
    for (let i = off; i < off + size; i++) {
      const v = a[i]; sum += v;
      if (v === 0) n0++; else if (v === 255) n255++; else mid++;
    }
    out.push({ n: size, p0: n0 / size, p255: n255 / size, pmid: mid / size, mean: sum / size });
  }
  /* 尾部不足一帧的零头（理论上不会有），按整体兜底 */
  if (!out.length) {
    let n0 = 0, n255 = 0, mid = 0, sum = 0;
    for (let i = 0; i < a.length; i++) {
      const v = a[i]; sum += v;
      if (v === 0) n0++; else if (v === 255) n255++; else mid++;
    }
    out.push({ n: a.length, p0: n0 / a.length, p255: n255 / a.length, pmid: mid / a.length, mean: sum / a.length });
  }
  return { frames: out };
}

/* ---------- 逐文件判定 ---------- */
let bad = 0, warn = 0;

for (const file of files) {
  const tag = path.relative(process.cwd(), file) || file;
  const ext = path.extname(file).toLowerCase();
  console.log(`\n${tag}   (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);

  let frameSize = 0, interval = 0, sampledNote = "";

  if (ext === ".png") {
    const hd = pngHeader(file);
    if (!hd) { console.log("  ❌ 不是合法 PNG"); bad++; continue; }
    console.log(`  尺寸 ${hd.w}x${hd.h}   colorType=${hd.ct}  ${CT_NAME[hd.ct] || "未知"}`);
    if (hd.ct !== 4 && hd.ct !== 6) {
      console.log("  ❌ 这张 PNG 根本没有 alpha 通道 —— 图像是不透明的，透明区实为白底");
      console.log("     → 原因通常是截图时漏了 --default-background-color=00000000");
      bad++; continue;
    }
    frameSize = hd.w * hd.h;          /* 单张图本来就只解一帧，不需要抽 */
  } else {
    const p = probeVideo(file);
    if (!p) {
      console.log("  ⚠️ 读不到视频信息（ffprobe 不可用？）—— 退化为全量统计，可能很慢");
      warn++;
    } else {
      frameSize = p.w * p.h;
      /* 抽样间隔：尽量抽满 SAMPLES 个点，且不密于 0.5s */
      interval = p.dur > 0 ? Math.max(p.dur / SAMPLES, 0.5) : 0;
      sampledNote = interval > 0
        ? `  · 每 ${interval.toFixed(2)}s 采样`
        : "";
    }
  }

  const res = alphaFrames(file, interval, frameSize);
  if (res.err) { console.log(`  ❌ ${res.err}`); bad++; continue; }

  const fs_ = res.frames;
  const agg = fs_.reduce((a, f) => ({
    p0: a.p0 + f.p0 / fs_.length, p255: a.p255 + f.p255 / fs_.length, pmid: a.pmid + f.pmid / fs_.length,
  }), { p0: 0, p255: 0, pmid: 0 });

  if (interval > 0) console.log(`  采样 ${fs_.length} 帧${sampledNote}`);
  console.log(`  alpha 平面: 真透明(a=0) ${pct(agg.p0)}   全不透明(a=255) ${pct(agg.p255)}   软边(中间值) ${pct(agg.pmid)}`);

  /* 最差一帧才是判据：整体达标但某一帧是实心，叠上去就是一闪的白板 */
  const worst = fs_.reduce((a, b) => (a.p0 <= b.p0 ? a : b));
  if (fs_.length > 1) {
    console.log(`  最差一帧: 真透明 ${pct(worst.p0)}（全不透明 ${pct(worst.p255)}）`);
  }

  if (worst.p255 > 0.99) {
    console.log("  ❌ 有帧的 alpha 全为 255 —— 这是假 alpha，叠到视频上会盖住画面，不可用");
    bad++;
  } else if (agg.p0 < 0.30) {
    console.log(`  ⚠️ 真透明像素只占 ${(100 * agg.p0).toFixed(1)}%（<30%）。若内容本就铺满则正常；`);
    console.log("     否则检查是否漏传 --default-background-color=00000000");
    warn++;
  } else {
    console.log(`  ✅ 真透明有效（${(100 * agg.p0).toFixed(1)}% 的像素完全透明）`);
  }
}

console.log(`\n${bad === 0 ? (warn ? `合格 ✅（${warn} 条提醒）` : "全部合格 ✅") : `有 ${bad} 项不合格 ❌`}`);
process.exit(bad === 0 ? 0 : 1);
