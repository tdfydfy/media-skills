#!/usr/bin/env node
/**
 * shoot.mjs —— 整体截图 / 逐幕导出 / 风格对照
 *
 * 用法：
 *   node scripts/shoot.mjs <产物.html>                     # 逐幕（或关键帧）批量截图
 *   node scripts/shoot.mjs <产物.html> --step 0.5          # 按固定间隔抽帧
 *   node scripts/shoot.mjs <产物.html> --points            # 只抽「素材点/组件点」附近的帧
 *   node scripts/shoot.mjs <产物.html> --frames            # 抽帧 + 给出可直接执行的 ffmpeg 命令
 *   node scripts/shoot.mjs <产物.html> --video             # 抽帧并直接合成视频（需 ffmpeg）
 *   node scripts/shoot.mjs <产物.html> --video --fps 30    # 补帧到恒定 30fps（默认保持定格帧率）
 *   node scripts/shoot.mjs <产物.html> --gallery            # 六风格对照页
 *   node scripts/shoot.mjs <产物.html> --out <目录> --scale 2
 *
 * 与 shoot-at.mjs 的分工：
 *   shoot-at.mjs  按「组件入点/出点」精确采样，用于核对卡点是否对齐 SRT
 *   shoot.mjs     按「固定时间间隔/逐幕/素材点」采样，用于整体观感检查与抽帧合成
 *
 * ★ 素材模式（PURPOSE=overlay + RATIO=3:4）默认走 --points：
 *   一条 60s 的素材里大段是全透明的，均匀抽帧会得到一堆空画面。
 *   出片（--video/--frames）时会自动退回均匀抽帧，因为合成需要连续的帧间隔。
 *
 * 原理同上：零网络，用 headless 浏览器自带 --screenshot 落盘。
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/* ---------- 浏览器探测 ---------- */
const BROWSERS = [
  process.env.IVH_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean);
const BROWSER = BROWSERS.find(p => fs.existsSync(p));
if (!BROWSER) { console.error("找不到 Edge / Chrome。请设置 IVH_BROWSER。"); process.exit(1); }

/* ---------- CLI ---------- */
const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith("-")) {
  console.error("用法: node scripts/shoot.mjs <产物.html> [--step 秒] [--frames] [--gallery] [--out 目录] [--scale N]");
  process.exit(1);
}
const FILE = path.resolve(argv[0]);
if (!fs.existsSync(FILE)) { console.error("文件不存在: " + FILE); process.exit(1); }

const getArg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const STEP   = Number(getArg("--step", 0)) || 0;
const FPS_ARG = Number(getArg("--fps", 0)) || 0;
const SCALE  = Number(getArg("--scale", 1)) || 1;
const FRAMES = argv.includes("--frames");
const VIDEO  = argv.includes("--video");
const GALLERY = argv.includes("--gallery");
const name = path.basename(FILE, ".html");
const outDir = path.resolve(getArg("--out", path.join(path.dirname(FILE), "frames-" + name)));
fs.mkdirSync(outDir, { recursive: true });

/* ---------- 读产物 ---------- */
const html = fs.readFileSync(FILE, "utf8");
const getCfg = k => (html.match(new RegExp("\\b" + k + "\\s*:\\s*'([^']*)'")) || [])[1];
const RATIO = getCfg("RATIO") || "16:9";
const BASE  = getCfg("BASE")  || "text";
const STYLE = getCfg("STYLE") || "doodle";
const BG    = getCfg("BG")    || "opaque";
const PURPOSE = getCfg("PURPOSE") || "standalone";

/* 叠加素材的两种子形态（与 check-template.mjs 保持同一套判据）：
     material  素材模式（overlay + 3:4）—— 一块板，用户自己摆，稀疏
     screen    整屏叠加（overlay + 其余比例）—— 铺满整屏，密集 */
const IS_OVERLAY = PURPOSE === "overlay";
const MATERIAL = IS_OVERLAY && RATIO === "3:4";
const KIND = !IS_OVERLAY ? "独立成片" : (MATERIAL ? "素材模式（3:4 一块板）" : "整屏叠加（铺满整屏）");

const SIZE = {
  "16:9": { w: 1920, h: 1080 }, "9:16": { w: 1080, h: 1920 },
  "4:3":  { w: 1440, h: 1080 }, "3:4":  { w: 1080, h: 1440 },
}[RATIO] || { w: 1920, h: 1080 };
console.log(`[shoot] ${name} · ${KIND} · ${RATIO} ${SIZE.w}x${SIZE.h} · ${BG}`);
if (IS_OVERLAY && !MATERIAL) {
  console.log("        ⚠ 整屏叠加：画布比例应与视频本体一致，且每个组件都要写 data-safe 避开中央。");
}

const runBrowser = (args, timeout = 60000) => {
  try {
    return execFileSync(BROWSER, args, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  } catch (e) { return (e.stdout || "") + (e.stderr || ""); }
};

const commonArgs = (userDir, w, h, budget) => [
  "--headless=new", "--disable-gpu", "--hide-scrollbars",
  "--no-first-run", "--no-default-browser-check",
  "--disable-extensions", "--disable-background-networking",
  `--user-data-dir=${userDir}`,
  `--window-size=${w},${h}`,
  `--force-device-scale-factor=${SCALE}`,
  `--virtual-time-budget=${budget}`,
  /* ★ 关键：BG=transparent 时必须显式指定透明底色。
     否则 headless 浏览器默认铺白，截出的 PNG 是 colorType=2（RGB，根本没有 alpha 通道），
     合成的 .mov 会带一个全 255 的假 alpha —— 叠到视频上就是一块实心白板。
     实测：不加这个参数 alpha 全 255；加了之后 91%~95% 的像素是真透明。 */
  ...(BG === "transparent" ? ["--default-background-color=00000000"] : []),
];

const shootOne = (url, png, budget = 5000) => {
  const userDir = path.join(os.tmpdir(), `ivh-frm-${process.pid}-${Math.random().toString(36).slice(2)}`);
  runBrowser([...commonArgs(userDir, SIZE.w, SIZE.h, budget), `--screenshot=${png}`, url]);
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {}
  return fs.existsSync(png);
};

const fileUrl = (extra = "") =>
  "file:///" + FILE.replace(/\\/g, "/").replace(/ /g, "%20") + extra;

/* ==========================================================================
   模式 A · 六风格对照页
   ========================================================================== */
if (GALLERY) {
  const STYLES = ["doodle", "riso", "blueprint", "minimal", "neon", "pixel"];
  const galDir = path.join(outDir, "gallery");
  fs.mkdirSync(galDir, { recursive: true });

  /* 为每个风格生成一份临时产物（只改 STYLE 与 HIDE_HUD，不改别的） */
  const items = [];
  for (const s of STYLES) {
    const variant = html
      .replace(/STYLE\s*:\s*'[a-z0-9-]+'/, `STYLE   : '${s}'`)
      .replace(/HIDE_HUD\s*:\s*(true|false)/, "HIDE_HUD: false");
    const vf = path.join(galDir, `_var-${s}.html`);
    fs.writeFileSync(vf, variant, "utf8");
    const png = path.join(galDir, `${name}-${s}.png`);
    const url = "file:///" + vf.replace(/\\/g, "/").replace(/ /g, "%20");
    const okShot = shootOne(url, png, 4800);
    items.push({ s, png: okShot ? path.basename(png) : null });
    console.log(`  ${okShot ? "●" : "✗"} ${s}`);
  }

  const galPage = path.join(galDir, "style-gallery.html");
  fs.writeFileSync(galPage, `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>六风格对照 · ${name}</title>
<style>
  :root{--ink:#2E2823;--paper:#EFE9DF;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--paper);color:var(--ink);padding:34px 28px 50px;
    font:400 15px/1.6 system-ui,"Microsoft YaHei",sans-serif;}
  h1{font-size:25px;margin-bottom:6px;}
  p.sub{opacity:.7;font-size:13.5px;margin-bottom:26px;}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;max-width:1700px;}
  @media(max-width:900px){.grid{grid-template-columns:1fr;}}
  figure{background:#fff;border:2px solid var(--ink);border-radius:12px;
    box-shadow:6px 7px 0 rgba(46,40,35,.13);overflow:hidden;}
  figcaption{padding:9px 14px;border-bottom:2px solid rgba(46,40,35,.14);
    font:700 13px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.06em;}
  figure img{display:block;width:100%;height:auto;background:#111;}
  .noshot{padding:50px;text-align:center;background:#fdd;font-size:13px;}
</style></head><body>
<h1>六风格对照 · ${name}</h1>
<p class="sub">同一份内容、同一套组件，只换 STYLE。用于确认风格差异是否足够明显。</p>
<div class="grid">
${items.map(i => `  <figure><figcaption>${i.s}</figcaption>${i.png ? `<img src="${i.png}" alt="${i.s}" loading="lazy">` : `<div class="noshot">截图失败</div>`}</figure>`).join("\n")}
</div>
</body></html>`);

  for (const i of items) fs.rmSync(path.join(galDir, `_var-${i.s}.html`), { force: true });
  console.log(`\n[shoot] 六风格对照页 -> ${galPage}`);
  console.log(galPage);
  process.exit(0);
}

/* ==========================================================================
   模式 B · 逐幕 / 按间隔 / 素材点 抽帧
   --------------------------------------------------------------------------
   ★ 先剥掉 HTML 注释再统计时间轴。
     模板里的 TL_DEMO 示例块是注释，但它同样含 data-in/data-out，
     不剥掉的话"总时长"会被注释里的示例数字带偏。
   ========================================================================== */
const bareHtml = html.replace(/<!--[\s\S]*?-->/g, "");
const allComps = [...bareHtml.matchAll(/<div[^>]*class="[^"]*\bcomp\b[^"]*"[^>]*>/g)].map(m => {
  const g = k => { const mm = m[0].match(new RegExp('data-' + k + '="([^"]*)"')); return mm ? parseFloat(mm[1]) : null; };
  return { in: g("in"), out: g("out") };
}).filter(c => Number.isFinite(c.in) && Number.isFinite(c.out));

const POINTS = argv.includes("--points");
if (POINTS && (FRAMES || VIDEO))
  console.warn("[shoot] --points 与 --video/--frames 冲突：合成需要连续的帧间隔，已改为均匀抽帧。");
/* 素材点采样只对「透明素材（overlay + 3:4）」有意义 —— 它的时间轴大段是空档。
   分幕/时间轴的独立成片是连续内容，应当均匀抽帧。 */
const usePoints = BASE === "timeline" && MATERIAL && !(FRAMES || VIDEO) && (POINTS || STEP === 0);
if (MATERIAL && STEP === 0 && (FRAMES || VIDEO))
  console.warn("[shoot] 素材模式出片：整条时间轴大段是全透明的，均匀抽帧会得到很多空帧。\n        建议先 --points 看画面，再按素材点密度用 --step 指定间隔出片。");

/* —— 总时长：两条路各有各的算法 ——
   timeline：max(data-out)   text：Σ data-sec
   模板运行时已把结果写进 data-duration，这里优先自己算，算不出再回退到它。 */
const timelineDur = Math.max(...allComps.map(c => c.out), 0);
const sceneDur = [...bareHtml.matchAll(/<section[^>]*class="[^"]*\bscene\b[^"]*"[^>]*data-sec="([\d.]+)"/g)]
  .reduce((n, m) => n + parseFloat(m[1]), 0);
const dataDur = parseFloat((html.match(/data-duration="([\d.]+)"/) || [])[1]) || 0;
const totalDur = (BASE === "timeline" ? timelineDur : sceneDur) || dataDur || 10;

/* 按时间抽帧的场合：timeline 一律；text 只要不是「只想逐幕看一张」就走时间轴。
   分幕模式的 ?t= 定位已由模板 10-C 段实现（负 animation-delay + 暂停 = 定格）。 */
const sampleByTime = BASE === "timeline" || STEP > 0 || FRAMES || VIDEO;

let shots = [];
if (sampleByTime) {
  const duration = totalDur;

  if (usePoints) {
    /* 素材点采样：每个组件取其入点、入点后一点、停留中点、出点前一点。
       素材模式一条 60s 的片子里大段是全透明的，均匀抽样只会得到一堆空画面。 */
    const times = [];
    for (const c of allComps) {
      const span = c.out - c.in;
      for (const raw of [c.in, c.in + Math.min(0.6, span * 0.3), c.in + span / 2, c.out - 0.4]) {
        times.push(+Math.max(c.in, Math.min(c.out - 0.05, raw)).toFixed(3));
      }
    }
    const uniq = [...new Set(times)].sort((a, b) => a - b);
    console.log(`[shoot] ${name} · 素材点采样 ${uniq.length} 张 · ${allComps.length} 个组件 · 时间轴总长 ${timelineDur}s`);
    for (const t of uniq) {
      const png = path.join(outDir, `${name}-p${String(t).padStart(7, "0").replace(".", "_")}.png`);
      const okShot = shootOne(fileUrl(`?t=${t}`), png, 3000);
      if (okShot) { shots.push({ t, png }); process.stdout.write(`\r  已抽 ${shots.length} 帧 @ ${t}s   `); }
    }
    console.log("");
  } else {
    const step = STEP > 0 ? STEP : Math.max(duration / 40, 0.2);
    const times = [];
    for (let t = 0; t <= duration + 1e-6; t += step) times.push(+t.toFixed(3));
    if (times[times.length - 1] < duration) times.push(+duration.toFixed(3));

    console.log(`[shoot] ${name} · ${BASE === "timeline" ? "timeline" : "分幕"} 抽帧 ${times.length} 张 · 间隔 ${step.toFixed(2)}s · 总长 ${duration}s`);
    for (const t of times) {
      const png = path.join(outDir, `${name}-f${String(t).padStart(7, "0").replace(".", "_")}.png`);
      const okShot = shootOne(fileUrl(`?t=${t}`), png, 3000);
      if (okShot) { shots.push({ t, png }); process.stdout.write(`\r  已抽 ${shots.length} 帧 @ ${t}s   `); }
    }
    console.log("");
  }
} else {
  /* 分幕模式：逐幕截图（靠 #<幕号> 定位，模板的 10-C 段已实现） */
  const nScenes = (bareHtml.match(/<section class="scene/g) || []).length || 3;
  console.log(`[shoot] ${name} · 分幕模式 ${nScenes} 幕`);
  for (let i = 0; i < nScenes; i++) {
    const png = path.join(outDir, `${name}-s${i + 1}.png`);
    const okShot = shootOne(fileUrl(`#${i + 1}`), png, 4200);
    if (okShot) shots.push({ t: i + 1, png });
    console.log(`  ${okShot ? "●" : "✗"} 第 ${i + 1} 幕`);
  }
}

console.log(`\n[shoot] 输出 ${shots.length} 张 -> ${outDir}`);

/* ==========================================================================
   合成视频 · --frames 给命令，--video 直接跑
   ========================================================================== */

/** 找 ffmpeg：环境变量 → PATH → 常见安装位 → ~/Developer 下的解压版 */
function findFfmpeg() {
  for (const c of [process.env.IVH_FFMPEG, "ffmpeg", "ffmpeg.exe"].filter(Boolean)) {
    try { execFileSync(c, ["-version"], { stdio: "ignore", timeout: 15000 }); return c; } catch {}
  }
  for (const p of [
    "C:/ffmpeg/bin/ffmpeg.exe",
    "C:/Program Files/ffmpeg/bin/ffmpeg.exe",
    "C:/Program Files (x86)/ffmpeg/bin/ffmpeg.exe",
  ]) if (fs.existsSync(p)) return p;
  /* Windows 上常见的「下载解压即用」布局：~/Developer/ffmpeg-xxx/<build>/bin/ffmpeg.exe */
  try {
    const root = path.join(os.homedir(), "Developer");
    if (fs.existsSync(root)) {
      for (const d of fs.readdirSync(root)) {
        if (!/ffmpeg/i.test(d)) continue;
        const sub = path.join(root, d);
        if (!fs.statSync(sub).isDirectory()) continue;
        for (const inner of fs.readdirSync(sub)) {
          const p = path.join(sub, inner, "bin", "ffmpeg.exe");
          if (fs.existsSync(p)) return p;
        }
      }
    }
  } catch {}
  return null;
}

if ((FRAMES || VIDEO) && shots.length) {
  if (shots.length < 2) {
    console.warn("[shoot] 只有 1 张帧，合不成视频（timeline 模式请用 --step <秒> 指定间隔）");
  } else if (BASE !== "timeline" && STEP === 0) {
    console.warn("[shoot] 分幕模式的截图是「每幕一张静态图」，不是时间序列，合出来的视频没有意义。");
    console.warn("         要出片请改成 timeline 模式，或用 --step <秒> 显式指定抽帧间隔。");
  } else {
    /* 1) 把帧物化成连续序号。
       原始文件名带 "t=12.5" 这种小数点，ffmpeg 的 %d 序列匹配不了，必须先规整。
       ★ 用 rename 而不是 copy：同盘改名是元数据操作，零拷贝。
         原来 copy 一份出来、原件不删，fine 档一条 30s 片子会留下两份 751 张 PNG
         （约 3GB）。改名之后 seq/ 就是唯一的帧目录，时间映射由 index.txt 保留，
         信息一点没少。 */
    const seqDir = path.join(outDir, "seq");
    fs.rmSync(seqDir, { recursive: true, force: true });
    fs.mkdirSync(seqDir, { recursive: true });
    const index = [];
    shots.forEach((s, i) => {
      const f = `frame-${String(i + 1).padStart(5, "0")}.png`;
      try { fs.renameSync(s.png, path.join(seqDir, f)); }
      catch { fs.copyFileSync(s.png, path.join(seqDir, f)); }   // 跨盘时改名会失败，退回拷贝
      index.push(`${f}\t${s.t}s`);
    });
    /* 序号 → 秒 的对照，方便回头定位某一帧 */
    fs.writeFileSync(path.join(seqDir, "index.txt"), index.join("\n") + "\n", "utf8");

    /* 2) 用相邻帧的实际间隔推算输入帧率，保证成片时长 = 原始时间轴长度 */
    const ts = shots.map(s => s.t);
    const diffs = ts.slice(1).map((v, i) => v - ts[i]).filter(d => d > 0);
    const stepAvg = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    const fps = Number((stepAvg > 0 ? 1 / stepAvg : 30).toFixed(4));

    /* 3) 透明底出 ProRes 4444（带 alpha），不透明出 H.264。
       默认保持抽帧的原生帧率（定格感），传 --fps 才补帧成恒定帧率。
       强行 -r 30 会把 25 帧补成 1500 帧，文件从 1MB 涨到 75MB，纯属浪费。 */
    const alpha = BG === "transparent";
    const outFile = path.join(outDir, alpha ? `${name}-alpha.mov` : `${name}.mp4`);
    const seqPattern = path.join(seqDir, "frame-%05d.png");
    const cfr = FPS_ARG > 0 ? ["-r", String(FPS_ARG)] : [];
    const cmd = alpha
      ? ["-y", "-framerate", String(fps), "-i", seqPattern,
         "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", ...cfr, outFile]
      : ["-y", "-framerate", String(fps), "-i", seqPattern,
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", ...cfr, outFile];

    const FFMPEG = findFfmpeg();
    const quote = s => (/\s/.test(s) ? `"${s}"` : s);
    console.log(`\n[shoot] 帧序列 -> ${seqDir}（frame-%05d.png + index.txt）`);
    console.log(`[shoot] 输入 ${fps}fps（间隔 ${stepAvg.toFixed(2)}s）× ${shots.length} 帧 → 约 ${(shots.length * (stepAvg || 0)).toFixed(1)}s${cfr.length ? ` · 已补帧到 ${FPS_ARG}fps` : " · 保持定格帧率"}`);
    console.log(`[shoot] ${alpha ? "透明 ProRes 4444" : "H.264"} 合成命令：`);
    console.log(`  ${[FFMPEG || "ffmpeg", ...cmd].map(quote).join(" ")}`);

    if (VIDEO) {
      if (!FFMPEG) {
        console.warn("\n[shoot] 没找到 ffmpeg，只输出命令。装好后设 IVH_FFMPEG 或加进 PATH 再跑。");
      } else {
        try {
          execFileSync(FFMPEG, cmd, { stdio: ["ignore", "ignore", "inherit"], timeout: 900000 });
          const mb = fs.existsSync(outFile) ? (fs.statSync(outFile).size / 1048576).toFixed(1) : "0";
          console.log(`\n[shoot] 视频 -> ${outFile}（${mb} MB）`);
          console.log(outFile);
        } catch (e) {
          console.error("\n[shoot] ffmpeg 合成失败：" + e.message);
          process.exitCode = 1;
        }
      }
    } else {
      console.log(`\n  提示：抽帧是「定格」采样，用于核对某个时间点长什么样。\n        想看整条片子的观感，直接打开 HTML 看——比抽帧快，而且能看到真实动效。\n        要出片请走 render.mjs，不要在这里手工拼帧。`);
    }
  }
}
