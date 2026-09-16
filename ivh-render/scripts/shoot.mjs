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
 *   node scripts/shoot.mjs <产物.html> --video --fps 30    # 成片输出 30fps 恒定帧率（默认就是 30）
 *   node scripts/shoot.mjs <产物.html> --engine cli        # 强制走「每帧一个浏览器」的老路
 *   node scripts/shoot.mjs <产物.html> --no-reuse-blank    # 空档不复用，逐帧老实渲染
 *   node scripts/shoot.mjs <产物.html> --video --keep-frames  # 出片后保留 seq/ 中间帧（默认出完即清）
 *   node scripts/shoot.mjs <产物.html> --gallery            # 六风格对照页
 *   node scripts/shoot.mjs <产物.html> --out <目录> --scale 2
 *   node scripts/shoot.mjs <产物.html> --workers 4         # 指定并行路数（默认 核数−2，上限 6）
 *   node scripts/shoot.mjs <产物.html> --gpu               # 放开 GPU 光栅化（默认关，见下）
 *
 * 与 shoot-at.mjs 的分工：
 *   shoot-at.mjs  按「组件入点/出点」精确采样，用于核对卡点是否对齐 SRT
 *   shoot.mjs     按「固定时间间隔/逐幕/素材点」采样，用于整体观感检查与抽帧合成
 *
 * ★ 素材模式（PURPOSE=overlay + RATIO=3:4）的两种采样：
 *   预览（不带 --video/--frames）默认走 --points，只看素材点附近的画面。
 *   出片（--video/--frames）仍按 --step 均匀铺满整条时间轴（合成需要连续帧），
 *   但空档不再逐帧渲染 —— 只渲染一张，其余复用（见「空档复用」）。
 *   空档帧在同一份产物里是逐字节相同的，复用后成片画面完全不变。
 *
 * 抽帧引擎（--engine auto|cdp|cli，默认 auto）：
 *   cdp   开一个浏览器、用 CDP 逐帧驱动产物的 IVH.seekAt(t)，实测 0.1s/帧 —— 快路径。
 *         传输自动择路：先试「CDP 管道」（--remote-debugging-pipe，不碰网络），
 *         不成再试「DevTools WebSocket」（127.0.0.1 回环）。
 *         电脑管家 / 360 这类安全软件的网络防护会掐断跨进程回环，管道这条不受影响。
 *         可用 IVH_CDP_TRANSPORT=pipe|ws 强制指定某一种。
 *   cli   每帧拉起一次 headless 浏览器 + --screenshot 落盘，实测 1.1s/帧；
 *         零网络、不依赖子进程回连，任何沙箱都能跑 —— 回退路径
 *   auto  先试 cdp，两种传输都连不上才退回 cli。两条路的画面逐像素一致，回退只影响耗时。
 *
 * 抽帧并行度（--workers）：
 *   默认「逻辑核 − 2」，两端封顶：≤8 逻辑核封 3，其余封 16（留给系统与 ffmpeg）；
 *   `--workers N` / IVH_WORKERS 可覆盖。
 *   实现是「多进程」：每路一个 node 子进程 + 一个独立浏览器。不在一进程里并发几个
 *   浏览器，是因为 CDP 消息的 JSON.parse 与 base64 解码发生在 node 这一侧，
 *   合在一个进程里会挤在同一个核上 —— 分进程后每路各占一个核。
 *   ★ 饱和点跟机器走，差得很远，所以默认值必须分档 —— 实测两个样本：
 *       笔记本 8 逻辑核 / 4 物理核 / 1920×1080 / 374 帧：
 *         1 路 51s、3 路 29s（1.76×）、6 路 30s —— 3 路就把 4 物理核吃满了；
 *       台式 i5-14600K 20 逻辑核 / 14 物理核 / 1080×1440 / 3072 帧实渲染：
 *         6 路 39.4s、10 路 28.1s、16 路 24.5s —— 到 16 路仍在线性区，没见拐点。
 *     超线程对 zlib 几乎无效（PNG 编码吃的是物理核），两个饱和点的差距主要来自物理核数。
 *     换机器要重标这两行。
 *   ★ 跨路数**不是**逐字节相同：台式上 6 路 vs 16 路有 90/4105 帧差 1~2 个色阶
 *     （PSNR 64 dB，肉眼是同一帧），而 6 vs 6、16 vs 16 各自 4105/4105 完全一致 ——
 *     渲染是「分片布局的确定性函数」。**要逐字节比对，必须同路数。**
 *   ★ worker 只负责抓帧，不跑 ffmpeg。编码只占出片总耗时 4%（93 帧/秒 vs 抽帧 8 帧/秒），
 *     分 N 次编再 concat 只是多一道工序、多一处参数必须完全一致的风险。分片是
 *     「捕获侧的工作单位」，不是「输出单位」。
 *   帧数太少（不足 8 帧/路）时自动退回单路 —— 起进程 + 载入产物的固定成本约 2s/路。
 *   --engine cli 时强制单路（cli 引擎本身就是逐帧起浏览器，并行没有意义）。
 *
 * --gpu：放开 GPU 光栅化。实测整片只快 15%（瓶颈在 PNG 编码不在光栅化），
 *   且会换掉光栅化后端 —— 软件后端在本机验证过逐字节确定性。默认关。
 */

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseComps, samplePlan, uniformTimes, alphaIsEmpty } from "./active-windows.mjs";

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
const ENGINE  = getArg("--engine", "auto");        /* auto | cdp | cli */
const OUT_FPS = FPS_ARG > 0 ? FPS_ARG : 30;        /* 成片的恒定帧率 */
const SCALE  = Number(getArg("--scale", 1)) || 1;
const FRAMES = argv.includes("--frames");
const VIDEO  = argv.includes("--video");
const GALLERY = argv.includes("--gallery");
const KEEP_FRAMES = argv.includes("--keep-frames");

/* ---------- GPU 开关 ----------
   放开光栅化的 GPU 加速。实测整片只快 15%（瓶颈在 PNG 编码，不在光栅化），
   默认关：软件光栅化那条路在本机验证过「同产物两次出片逐字节一致」。
   写进 process.env 是因为 cdp-shoot.mjs 在模块顶部读它，而它是动态 import 进来的。 */
const GPU = argv.includes("--gpu");
if (GPU) process.env.IVH_GPU = "1";

/* ---------- 并行度：逻辑核 − 2，小机器封 3、大机器封 16（见文件头「抽帧并行度」） ---------- */
const WORKER_CAP = os.cpus().length <= 8 ? 3 : 16;
const resolveWorkers = () => {
  const override = Number(getArg("--workers", 0)) || Number(process.env.IVH_WORKERS || 0);
  const auto = Math.max(1, Math.min(os.cpus().length - 2, WORKER_CAP));
  return Math.max(1, Math.min(override || auto, 16));
};
const WORKERS = resolveWorkers();

/* worker 模式的内部参数（由主进程 spawn 自己时带上；手写命令行不该用到） */
const SHARD_FILE = getArg("--shard-file", "");
const SHARD_MANIFEST = getArg("--shard-manifest", "");
const SHARD_TAG = getArg("--shard-tag", "f");
const SHARD_ID = Number(getArg("--shard-id", "-1"));
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
const { comps: allComps, outDur: OUT_DUR } = parseComps(html);

const POINTS = argv.includes("--points");
if (POINTS && (FRAMES || VIDEO))
  console.warn("[shoot] --points 只管预览取样；出片按 --step 均匀铺满时间轴，空档由引擎自动复用。");
/* 素材点采样只对「透明素材（overlay + 3:4）」有意义 —— 它的时间轴大段是空档。
   分幕/时间轴的独立成片是连续内容，应当均匀抽帧。 */
const usePoints = BASE === "timeline" && MATERIAL && !(FRAMES || VIDEO) && (POINTS || STEP === 0);

/* ---------- 空档复用 ----------
   素材模式出片时，整条时间轴上大部分秒数一个可见像素都没有。逐帧渲染它们纯属白干：
   实测同一份产物里两个空档时刻截出的 PNG 逐字节相同（MD5 一致、alpha 平面全 0）。
   于是只渲染一张空档帧，其余空档全部复用它 —— 成片画面一点不变，
   帧序号与时间映射也不变（seq/ 里该有的帧一张不少）。
   只对「透明产物」成立：不透明产物的空档里还有纸底和进度条，那不算空档。
   ★ 复用前会对那一张实测 alpha，不是靠推断（见 shootWithBlankReuse）。 */
const REUSE_BLANK = !argv.includes("--no-reuse-blank")
  && (argv.includes("--reuse-blank")
      || (MATERIAL && BASE === "timeline" && BG === "transparent" && (FRAMES || VIDEO)));
if (MATERIAL && STEP === 0 && (FRAMES || VIDEO) && !REUSE_BLANK)
  console.warn("[shoot] 素材模式出片：整条时间轴上大段是全透明的，建议先 --points 看画面，再用 --step 指定间隔。");

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

/* 一路抽帧：一个浏览器，把这串时刻逐帧抓下来。
   两条引擎产出的 PNG 同名同内容，所以回退是无缝的。
   tag 决定文件名前缀：f = 均匀抽帧 / p = 素材点采样。
   quiet = worker 模式：不往 stdout 写字，进度由主进程数文件来报。 */
const captureShard = async (times, tag, quiet = false) => {
  const filePrefix = `${name}-${tag}`;
  if (ENGINE !== "cli") {
    const { captureFrames } = await import("./cdp-shoot.mjs");
    let explained = false, announced = false;
    const res = await captureFrames({
      browser: BROWSER, file: FILE, times, outDir, filePrefix,
      size: SIZE, scale: SCALE, transparent: BG === "transparent",
      log: (done, total, t, perFrame, err, how) => {
        if (err) {
          /* 每种传输失败都会报一次，都打出来 —— 排障时要知道是哪条路不通、为什么。 */
          const label = how === "管道" ? "管道传输" : "WebSocket 传输";
          console.warn(`[shoot] ${label}不可用：${err}`);
          if (!explained) {
            explained = true;
            console.warn("        逐个传输重试中；都不可用才回退到逐帧浏览器（会慢一个数量级）。");
          }
          return;
        }
        if (!announced && how) {
          announced = true;
          if (!quiet) console.log(`[shoot] 单浏览器引擎就绪（${how}传输）`);
        }
        if (!quiet) process.stdout.write(`\r  已抽 ${done}/${total} 帧 @ ${t}s · ${perFrame.toFixed(0)}ms/帧   `);
      },
    });
    if (res) {
      if (!quiet) process.stdout.write("\r" + " ".repeat(64) + "\r");
      return res;
    }
    if (ENGINE === "cdp") {
      console.error("[shoot] 指定了 --engine cdp，但单浏览器引擎不可用。");
      process.exit(1);
    }
  }
  const out = [];
  for (const t of times) {
    const png = path.join(outDir, `${filePrefix}${String(t).padStart(7, "0").replace(".", "_")}.png`);
    if (shootOne(fileUrl(`?t=${t}`), png, 3000)) {
      out.push({ t, png });
      if (!quiet) process.stdout.write(`\r  已抽 ${out.length}/${times.length} 帧 @ ${t}s   `);
    }
  }
  if (!quiet) process.stdout.write("\r" + " ".repeat(64) + "\r");
  return out;
};

/* ==========================================================================
   并行抽帧：把 times 切成 W 段，每段一个 worker（独立进程 + 独立浏览器）
   --------------------------------------------------------------------------
   ★ 为什么是「多进程」而不是一个进程里并发几个浏览器：
     PNG 编码确实在浏览器进程里跑，但 CDP 消息的 JSON.parse 与 base64 解码
     发生在本进程 —— 那部分会全挤在一个核上。分进程后每路各占一个核。
   ★ worker 不做 ffmpeg：编码只占出片总耗时 4%（93 帧/秒 vs 抽帧 8 帧/秒），
     分 N 次编再 concat 只是多一道工序、多一处「参数必须完全一致」的风险。
     分片是「捕获侧的工作单位」，不是「输出单位」。
   ★ 帧数不足 8 帧/路时不并行：起进程 + 载入产物的固定成本约 2s/路。
   ========================================================================== */
const MIN_FRAMES_PER_SHARD = 8;

const captureInParallel = async (times, tag, W) => {
  const chunk = Math.ceil(times.length / W);
  const shards = [];
  for (let i = 0; i < times.length; i += chunk) shards.push(times.slice(i, i + chunk));

  const tmp = path.join(outDir, "_shards");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });

  const jobs = shards.map((ts, i) => {
    const inp = path.join(tmp, `in-${i}.json`);
    fs.writeFileSync(inp, JSON.stringify(ts), "utf8");
    return { i, ts, inp, out: path.join(tmp, `out-${i}.json`) };
  });

  console.log(`[shoot] 并行抽帧 ${jobs.length} 路 × 约 ${chunk} 帧/路`
    + `（本机 ${os.cpus().length} 逻辑核 − 2 预留，上限 ${WORKER_CAP}）`);

  const run = j => new Promise(resolve => {
    const a = [fileURLToPath(import.meta.url), FILE, "--out", outDir, "--scale", String(SCALE),
      "--shard-file", j.inp, "--shard-manifest", j.out, "--shard-tag", tag, "--shard-id", String(j.i)];
    if (ENGINE !== "auto") a.push("--engine", ENGINE);
    if (GPU) a.push("--gpu");
    const c = spawn(process.execPath, a, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let err = "";
    c.stderr.on("data", d => { err = (err + d.toString()).slice(-1000); });
    c.on("error", e => resolve({ code: -1, err: e.message }));
    c.on("exit", code => resolve({ code, err }));
  });

  /* 进度由主进程数文件得出 —— 不为了一句进度信息发明一套 IPC 协议。
     worker 各写各的帧，t 互不重叠，所以文件名不冲突，数出来就是总进度。 */
  const tick = setInterval(() => {
    let n = 0;
    try { n = fs.readdirSync(outDir).filter(f => f.startsWith(`${name}-${tag}`) && f.endsWith(".png")).length; } catch {}
    process.stdout.write(`\r  并行抽帧 ${Math.min(n, times.length)}/${times.length} 帧 · ${jobs.length} 路   `);
  }, 1500);

  const results = await Promise.all(jobs.map(run));
  clearInterval(tick);
  process.stdout.write("\r" + " ".repeat(64) + "\r");

  /* 收工：manifest 齐全且帧数对得上的才算数；缺的串行补抽（不重跑整路）。 */
  const ok = [], bad = [];
  for (const [i, j] of jobs.entries()) {
    let arr = null;
    try { arr = JSON.parse(fs.readFileSync(j.out, "utf8")); } catch {}
    if (arr && arr.length === j.ts.length) ok.push(...arr);
    else {
      bad.push(j);
      const why = results[i] && results[i].code !== 0 ? `退出码 ${results[i].code}` : "manifest 不完整";
      console.warn(`[shoot] 第 ${i + 1} 路未完成（${why}）`
        + (results[i] && results[i].err ? `\n        ${results[i].err.split("\n").slice(-3).join("\n        ")}` : ""));
    }
  }
  if (bad.length) {
    console.warn(`[shoot] 串行补抽 ${bad.length} 路共 ${bad.reduce((n, j) => n + j.ts.length, 0)} 帧…`);
    for (const j of bad) {
      const extra = await captureShard(j.ts, tag, true);
      if (extra && extra.length) {
        const want = new Set(j.ts);
        ok.push(...extra.filter(s => want.has(s.t)));
      }
    }
  }

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

  /* 按 times 的原始顺序排回去：并行之后回来的次序是乱的，
     而下游的 seq/frame-%05d.png 必须严格按时间轴顺序落号。 */
  const rank = new Map(times.map((t, i) => [t, i]));
  ok.sort((a, b) => (rank.get(a.t) ?? 1e9) - (rank.get(b.t) ?? 1e9));
  console.log(`[shoot] 并行抽帧完成：${ok.length}/${times.length} 帧`);
  return ok;
};

/* 分发：能并行就并行，不能就单路。所有调用点看到的都是这一个函数。 */
const shootTimes = async (times, tag) => {
  const W = Math.min(WORKERS, Math.floor(times.length / MIN_FRAMES_PER_SHARD));
  if (ENGINE === "cli" || W <= 1) return captureShard(times, tag);
  return captureInParallel(times, tag, W);
};

/* ==========================================================================
   worker 模式：主进程 spawn 自己时带 --shard-file。
   只抓帧、写 manifest、退出 —— 不碰 seq/、不碰 ffmpeg。
   ========================================================================== */
if (SHARD_FILE) {
  const times = JSON.parse(fs.readFileSync(SHARD_FILE, "utf8"));
  const shots = await captureShard(times, SHARD_TAG, true);
  const got = (shots || []).map(s => ({ t: s.t, png: s.png }));
  fs.writeFileSync(SHARD_MANIFEST, JSON.stringify(got), "utf8");
  process.exit(got.length === times.length ? 0 : 1);
}

/* 空档复用：渲染一张空档帧、实测它的 alpha，确认全透明之后才复用。
   实测不过（HIDE_HUD 没关、BG 其实是 opaque、产物里还有别的可见元素……）
   就退回均匀抽帧 —— 拿不准的时候宁可慢，也不要交一份画面不对的素材。 */
const shootWithBlankReuse = async (plan) => {
  const { times, activeTimes, blankT } = plan;
  const gapCount = times.length - activeTimes.length;
  console.log(`  ★ 空档复用：${allComps.length} 个组件 → ${plan.spans.length} 段有内容 · `
    + `${times.length} 帧里只有 ${activeTimes.length} 帧要渲染，空档 ${gapCount} 帧复用 1 张`);

  /* 一次把「有内容的帧 + 那张空档帧」都抽掉：同一个浏览器、同一趟顺序，
     不空跑第二趟。空档帧被夹在时间轴的正确位置上，顺便也验证了它前后确实是空档。 */
  const targets = [...new Set([...activeTimes, blankT])].sort((a, b) => a - b);
  const rendered = await shootTimes(targets, "f");
  const byTime = new Map(rendered.map(s => [s.t, s.png]));

  const blank = byTime.get(blankT);
  const alpha = blank ? alphaIsEmpty(findFfmpeg(), blank) : null;
  if (alpha !== true) {
    console.warn(`  ! 空档帧（t=${blankT}s）实测不是全透明`
      + `${alpha === null ? "，读不出 alpha 平面" : ""} —— 不复用，退回均匀抽帧。`);
    return shootTimes(times, "f");
  }

  const activeSet = new Set(activeTimes);
  const out = [];
  let missing = 0;
  for (const t of times) {
    if (!activeSet.has(t)) { out.push({ t, png: blank, blank: true }); continue; }
    const png = byTime.get(t);
    if (png) out.push({ t, png });
    else missing++;                       /* 有内容的帧没抽到，不能拿空档帧糊过去 */
  }
  if (missing) {
    console.warn(`  ! ${missing} 帧有内容的帧没抽到，退回均匀抽帧重来。`);
    return shootTimes(times, "f");
  }
  console.log(`  ✓ 空档帧 t=${blankT}s 实测 alpha 全 0 —— 复用它 ${gapCount} 帧，成片画面不变`);
  return out;
};

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
    shots = await shootTimes(uniq, "p");
    console.log("");
  } else {
    const step = STEP > 0 ? STEP : Math.max(duration / 40, 0.2);
    /* 带上 OUT_FPS：时间点落在输出帧栅格上，采样帧率与 -r 精确对齐（见 uniformTimes） */
    const times = uniformTimes(duration, step, OUT_FPS);

    console.log(`[shoot] ${name} · ${BASE === "timeline" ? "timeline" : "分幕"} 抽帧 ${times.length} 张 · 间隔 ${step.toFixed(2)}s · 总长 ${duration}s`);
    /* 空档复用只改「渲染哪些帧」，不改 times —— 帧序号、时间映射、成片时长一律不动。 */
    const plan = REUSE_BLANK ? samplePlan(html, duration, step, OUT_FPS) : null;
    shots = (plan && plan.blankT !== null)
      ? await shootWithBlankReuse(plan)
      : await shootTimes(times, "f");
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
         信息一点没少。
       ★ seq/ 不是长期产物：合成成功后默认删除（见本段末尾「收尾」）。 */
    const seqDir = path.join(outDir, "seq");
    fs.rmSync(seqDir, { recursive: true, force: true });
    fs.mkdirSync(seqDir, { recursive: true });
    const index = [];
    let reused = 0;
    shots.forEach((s, i) => {
      const f = `frame-${String(i + 1).padStart(5, "0")}.png`;
      const dst = path.join(seqDir, f);
      /* 空档帧：同一张全透明 PNG 会被复用几百次。硬链接最省 —— 同盘是元数据操作，
         不占额外空间、也不花拷贝时间；文件系统不支持时退回拷贝（一张 9KB，代价可忽略）。 */
      if (s.blank) {
        reused++;
        try { fs.linkSync(s.png, dst); }
        catch { try { fs.copyFileSync(s.png, dst); } catch {} }
      } else {
        try { fs.renameSync(s.png, dst); }
        catch { fs.copyFileSync(s.png, dst); }   // 跨盘时改名会失败，退回拷贝
      }
      index.push(`${f}\t${s.t}s`);
    });
    /* 序号 → 秒 的对照，方便回头定位某一帧 */
    fs.writeFileSync(path.join(seqDir, "index.txt"), index.join("\n") + "\n", "utf8");
    if (reused) console.log(`[shoot] 空档复用：${reused} 帧指向同一张全透明帧（硬链接，不重复占空间）`);

    /* 2) 用相邻帧的实际间隔推算输入帧率，保证成片时长 = 原始时间轴长度 */
    const ts = shots.map(s => s.t);
    const diffs = ts.slice(1).map((v, i) => v - ts[i]).filter(d => d > 0);
    const stepAvg = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    /* 采样帧率 = 每秒采到几张真实画面，决定运动顺不顺滑；
       输出帧率 = 成片容器的恒定帧率，决定剪辑软件怎么解读这段素材。两者是两件事。 */
    const sampleFps = Number((stepAvg > 0 ? 1 / stepAvg : OUT_FPS).toFixed(4));

    /* 3) 透明底出 ProRes 4444（带 alpha），不透明出 H.264。
       ★ 一律输出 OUT_FPS 的恒定帧率。原来是「抽帧多细、成片就是多少帧率」——
         normal 档出 10fps、draft 档出 2fps，交出去的其实不是一条正常帧率的片子，
         剪辑软件只能自己猜。采多少帧仍由 --step 决定（那才是清晰度/耗时的取舍），
         容器帧率则固定下来。 */
    const alpha = BG === "transparent";
    const outFile = path.join(outDir, alpha ? `${name}-alpha.mov` : `${name}.mp4`);
    const seqPattern = path.join(seqDir, "frame-%05d.png");
    const cfr = ["-r", String(OUT_FPS)];
    const cmd = alpha
      ? ["-y", "-framerate", String(sampleFps), "-i", seqPattern,
         "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", ...cfr, outFile]
      : ["-y", "-framerate", String(sampleFps), "-i", seqPattern,
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", ...cfr, outFile];

    const FFMPEG = findFfmpeg();
    const quote = s => (/\s/.test(s) ? `"${s}"` : s);
    console.log(`\n[shoot] 帧序列 -> ${seqDir}（frame-%05d.png + index.txt）`);
    console.log(`[shoot] 采样 ${sampleFps}fps（间隔 ${stepAvg.toFixed(2)}s）× ${shots.length} 帧 → 约 ${(shots.length * (stepAvg || 0)).toFixed(1)}s · 输出 ${OUT_FPS}fps CFR`);
    if (sampleFps < OUT_FPS * 0.6)
      console.log(`        ! 采样只有 ${sampleFps.toFixed(1)}fps，成片里每张画面要顶 ${(OUT_FPS / sampleFps).toFixed(1)} 帧 —— 运动是「定格感」的。要顺滑就调小 --step。`);
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

    /* 4) 收尾：中间帧用完即清。
       mp4 已经落盘，seq/ 这几千张 PNG 的唯一剩余用途是「不重抽帧、只换编码参数
       重出一版」。默认清掉 —— fine 档一条 3 分钟片子就是 2.1GB，不清会在每个
       产物目录里静默堆积（上一轮就是漏在这里）。要留着就加 --keep-frames。 */
    const dirSize = d => {
      const seen = new Set();
      let n = 0;
      for (const f of fs.readdirSync(d)) {
        try {
          const st = fs.statSync(path.join(d, f));
          const key = st.ino ? st.dev + ":" + st.ino : f;   /* 硬链接的空档帧只算一次 */
          if (seen.has(key)) continue;
          seen.add(key);
          n += st.size;
        } catch {}
      }
      return n;
    };
    if (VIDEO && KEEP_FRAMES) {
      console.log(`\n[shoot] seq/ 已保留（--keep-frames）：${seqDir}`);
    } else if (VIDEO && !process.exitCode && fs.existsSync(outFile)) {
      try {
        const bytes = dirSize(seqDir);
        fs.rmSync(seqDir, { recursive: true, force: true });
        console.log(`\n[shoot] 中间帧已清理：seq/ 回收 ${(bytes / 1048576).toFixed(0)} MB`);
        console.log(`        想留着换编码参数重出，下次加 --keep-frames。`);
      } catch (e) {
        console.warn(`\n[shoot] seq/ 清理失败（不影响成片）：${e.message}`);
      }
    }
  }
}
