#!/usr/bin/env node
/**
 * check-determinism.mjs —— 抽帧确定性检查：同一份产物拍两遍，逐字节比。
 *
 * 为什么需要它：产物里的数字滚动是「页面加载后排一个定时器、用 rAF 推进」的动画。
 * 抽帧时 rAF 只跟着「被截图的帧」走，1.1s 的滚动会被摊到几十帧上；截图若落在
 * 滚动中，就会拍到中间值。曾经实测同一份产物拍两遍，同一张卡拍到过
 * 5,760 / 4,324 两个值 —— 数字型片子里数字就是论点，这种不确定性不能交出去。
 *
 * 取样自动分两类，覆盖两种风险：
 *   · 数字卡 —— 从产物里解析 .num 的宿主组件，每张卡取「滚动刚结束」与「卡中段」两点
 *   · 均匀点 —— 沿整条时间轴铺 --samples 个点，覆盖入场/退场/组件切换
 *
 * 用法：
 *   node scripts/check-determinism.mjs <产物.html>              # 默认 24 个均匀点
 *   node scripts/check-determinism.mjs <产物.html> --samples 40
 *
 * 退出码 0 = 全部逐字节一致；1 = 有漂移（并把两遍的帧路径打出来供人眼复核）。
 *
 * 已知可接受的例外：动画恰好定格在「进度 0」的那一帧，合成器对 paused 动画的
 * 起始时刻有微秒级差异，会让字形抗锯齿差出几个像素（实测 762 px / 1920×1080，
 * 最大通道差 29/765）。判据是：同尺寸文件只差几十字节，且差异全落在文字区。
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CDP = path.join(HERE, "cdp-shoot.mjs");

const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith("-")) {
  console.error("用法: node scripts/check-determinism.mjs <产物.html> [--samples N]");
  process.exit(1);
}
const FILE = path.resolve(argv[0]);
if (!fs.existsSync(FILE)) { console.error("文件不存在: " + FILE); process.exit(1); }
const getArg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const NSAMPLE = Number(getArg("--samples", 0)) || 24;

const BROWSER = [
  process.env.IVH_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean).find(p => fs.existsSync(p));
if (!BROWSER) { console.error("没找到 Edge / Chrome，设 IVH_BROWSER 指向浏览器可执行文件。"); process.exit(1); }

/* ---------- 从产物里读时间轴总长与数字卡 ---------- */
const html = fs.readFileSync(FILE, "utf8");
/* 总长有两种口径，与 render.mjs 一致：timeline 取 max(data-out)，text 累加 data-sec */
const bare = html.replace(/<!--[\s\S]*?-->/g, "");
const outs = [...bare.matchAll(/<div[^>]*class="[^"]*\bcomp\b[^"]*"[^>]*>/g)]
  .map(m => (m[0].match(/data-out="([\d.]+)"/) || [])[1]).filter(Boolean).map(Number);
const segs = [...bare.matchAll(/<section[^>]*class="[^"]*\bscene\b[^"]*"[^>]*data-sec="([\d.]+)"/g)]
  .map(m => Number(m[1]));
const DUR = outs.length ? Math.max(...outs) : segs.reduce((a, b) => a + b, 0);
if (!(DUR > 0)) { console.error("取不到时间轴总长，产物里既没有 data-out 也没有 data-sec。"); process.exit(1); }

/* 数字卡：宿主 .comp 里带 data-to 的 .num。
   ★ data-to / data-dur 写在 .comp 的**后代**元素上，所以必须按组件切块看内部，
     只看开标签一个也匹配不到。 */
const compRe = /<div[^>]*class="[^"]*\bcomp\b[^"]*"[^>]*>/g;
const hits = [...bare.matchAll(compRe)];
const cards = [];
hits.forEach((h, i) => {
  const inner = bare.slice(h.index + h[0].length, i + 1 < hits.length ? hits[i + 1].index : bare.length);
  const to = inner.match(/data-to="([\d.]+)"/);
  const win = h[0].match(/data-in="([\d.]+)"[^>]*data-out="([\d.]+)"/);
  if (!to || !win) return;
  const tin = Number(win[1]), tout = Number(win[2]);
  const dur = Number((inner.match(/data-dur="([\d.]+)"/) || [])[1] || 1);
  /* 两点：滚动结束后 0.3s（终值必须已经落定）、卡片中段 */
  cards.push(+(tin + 0.4 + dur + 0.3).toFixed(3));
  cards.push(+((tin + tout) / 2).toFixed(3));
});

const uniform = Array.from({ length: NSAMPLE }, (_, i) => +(i * DUR / (NSAMPLE - 1)).toFixed(3));
const times = [...new Set([...cards, ...uniform])].sort((a, b) => a - b);

const { captureFrames } = await import(pathToFileURL(CDP).href);
const md5 = p => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");

const pass = async tag => {
  const outDir = path.join(path.dirname(FILE), `.determinism-${tag}`);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const res = await captureFrames({
    browser: BROWSER, file: FILE, times, outDir, filePrefix: tag + "-",
    size: { w: 1920, h: 1080 }, scale: 1, transparent: false, log: () => {},
  });
  if (!res) { console.error(`[determinism] ${tag} 取帧失败`); process.exit(1); }
  return res.sort((a, b) => a.t - b.t).map(r => ({
    t: r.t, png: r.png, md5: md5(r.png), size: fs.statSync(r.png).size,
  }));
};

console.log(`[determinism] ${path.basename(FILE)} · 总长 ${DUR.toFixed(3)}s`);
console.log(`[determinism] 取样 ${times.length} 点（数字卡 ${cards.length} + 均匀 ${NSAMPLE}，去重后）`);
const A = await pass("a");
const B = await pass("b");
const cardSet = new Set(cards);
let same = 0;
const drift = [];
for (let i = 0; i < A.length; i++) {
  if (A[i].md5 === B[i].md5) { same++; continue; }
  drift.push({ ...A[i], sizeB: B[i].size, pngB: B[i].png });
}
console.log(`\n[determinism] ${same} 一致 / ${drift.length} 漂移`);
for (const d of drift) {
  const dB = d.sizeB - d.size;
  console.log(`  ★ ${cardSet.has(d.t) ? "数字卡" : "均匀点"} t=${d.t}  ${d.size}B / ${d.sizeB}B（差 ${dB >= 0 ? "+" : ""}${dB}）`
    + `${Math.abs(dB) < 200 ? "  ← 微差，多半是抗锯齿" : "  ← 幅度大，先怀疑数字落值"}`);
  console.log(`      a: ${d.png}`);
  console.log(`      b: ${d.pngB}`);
}
if (!drift.length) {
  /* 通过了就把两遍的帧清掉（几十张 PNG，留着没意义）；有漂移才留下来给人眼复核 */
  for (const tag of ["a", "b"]) {
    fs.rmSync(path.join(path.dirname(FILE), `.determinism-${tag}`), { recursive: true, force: true });
  }
  console.log(`\n[determinism] 抽帧完全确定 —— 同一份产物跑多少遍都是逐字节相同。`);
} else {
  console.log(`\n[determinism] 有 ${drift.length} 点需要复核。两遍的帧留在产物旁的 .determinism-a / -b，人眼看一眼。`);
}
process.exit(drift.length ? 1 : 0);
