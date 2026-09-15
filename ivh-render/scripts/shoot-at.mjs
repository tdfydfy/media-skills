#!/usr/bin/env node
/**
 * shoot-at.mjs —— 按秒截图，核对卡点
 *
 * 用法：
 *   node scripts/shoot-at.mjs <产物.html>                  # 自动挑关键秒
 *   node scripts/shoot-at.mjs <产物.html> 3.5 9.0 14.2     # 指定秒
 *   node scripts/shoot-at.mjs <产物.html> --out <目录>
 *   node scripts/shoot-at.mjs <产物.html> --scale 1        # 设备像素比
 *
 * 原理：
 *   产物支持 ?t=<秒> 定位（时间轴模式）或 #<幕号>（分幕模式）。
 *   本脚本为每个时刻单独拉起一个 headless 浏览器，用 Edge/Chrome 自带的
 *   --screenshot 参数直接落盘 PNG，再用 --dump-dom 读回 TL 运行时状态。
 *   ★ 全程零网络：不依赖 CDP 端口、不依赖子进程回连，任何沙箱都能跑。
 *
 * 产出：
 *   <out>/<name>-t<秒>.png        每时刻一张
 *   <out>/<name>-at-shots.html    核对页（含每张的运行时探针）
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
if (!BROWSER) {
  console.error("找不到 Edge / Chrome。请设置 IVH_BROWSER 指向浏览器可执行文件。");
  process.exit(1);
}

/* ---------- CLI ---------- */
const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith("-")) {
  console.error("用法: node scripts/shoot-at.mjs <产物.html> [秒...] [--out 目录] [--scale N]");
  process.exit(1);
}
const FILE = path.resolve(argv[0]);
if (!fs.existsSync(FILE)) { console.error("文件不存在: " + FILE); process.exit(1); }

let times = [];
let outDir = null;
let SCALE = 1;
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--out") outDir = argv[++i];
  else if (a === "--scale") SCALE = Number(argv[++i]) || 1;
  else times.push(...a.split(",").map(Number).filter(n => Number.isFinite(n)));
}

const name = path.basename(FILE, ".html");
outDir = outDir || path.join(path.dirname(FILE), "shots-" + name);
fs.mkdirSync(outDir, { recursive: true });

/* ---------- 读产物，定尺寸与采样点 ---------- */
const html = fs.readFileSync(FILE, "utf8");
const getCfg = k => (html.match(new RegExp("\\b" + k + "\\s*:\\s*'([^']*)'")) || [])[1];
const RATIO = getCfg("RATIO") || "16:9";
const BASE  = getCfg("BASE")  || "text";
const BG    = getCfg("BG")    || "opaque";
const SIZE = {
  "16:9": { w: 1920, h: 1080 }, "9:16": { w: 1080, h: 1920 },
  "4:3":  { w: 1440, h: 1080 }, "3:4":  { w: 1080, h: 1440 },
}[RATIO] || { w: 1920, h: 1080 };

/* 自动挑关键秒 */
if (times.length === 0) {
  const comps = [...html.matchAll(/<div[^>]*class="[^"]*\bcomp\b[^"]*"[^>]*>/g)]
    .map(m => ({
      in:  parseFloat((m[0].match(/data-in="([^"]*)"/)  || [])[1]),
      out: parseFloat((m[0].match(/data-out="([^"]*)"/) || [])[1]),
    }))
    .filter(c => Number.isFinite(c.in) && Number.isFinite(c.out));
  if (comps.length) {
    const s = new Set([0]);
    for (const c of comps) {
      /* ★ 入场定格之后，「in 附近」和「入场结束时」是两张不同的图：
         in+0.2 是入场进行到一半（能看出动效真的在放），
         in+0.9 是入场落定（能看清内容与排版）。
         两边都要 —— 只拍前者会以为组件还没画出来，只拍后者看不出动效。 */
      s.add(+(c.in + 0.2).toFixed(2));               /* 入场进行中 */
      s.add(+(c.in + 0.9).toFixed(2));               /* 入场落定 */
      s.add(+((c.in + c.out) / 2).toFixed(2));        /* 停留中点 */
      s.add(+Math.max(c.out - 0.05, 0).toFixed(2));   /* 即将退场 */
    }
    times = [...s].sort((a, b) => a - b);
  } else {
    const n = (html.match(/<section class="scene/g) || []).length || 3;
    times = Array.from({ length: n }, (_, i) => i);
  }
}
times = [...new Set(times)].sort((a, b) => a - b);

console.log(`[shoot-at] ${name} · RATIO=${RATIO} ${SIZE.w}x${SIZE.h} · BASE=${BASE}`);
console.log(`[shoot-at] 采样时刻：${times.join(" / ")}`);
console.log(`[shoot-at] 浏览器：${BROWSER}`);

/* ---------- 单个时刻：截图 + 探针 ---------- */
const PROBE_JS = `JSON.stringify((()=>{
  const inEls=[...document.querySelectorAll('.comp.in')];
  return {
    t:(typeof TL!=='undefined'&&TL)?+TL.t.toFixed(2):null,
    playing:(typeof TL!=='undefined'&&TL)?!!TL.playing:null,
    scene:(typeof curScene==='number')?curScene:null,
    inCount:inEls.length,
    total:document.querySelectorAll('.comp').length,
    inList:inEls.map(e=>(e.dataset.safe||'?')+':'+(e.dataset.in||'')+'-'+(e.dataset.out||'')),
    clock:(document.getElementById('pageNo')||{}).textContent||null,
    cfg:(typeof CONFIG!=='undefined')?{PURPOSE:CONFIG.PURPOSE,BASE:CONFIG.BASE,BG:CONFIG.BG,RATIO:CONFIG.RATIO,STYLE:CONFIG.STYLE}:null
  };
})())`;

/* 把探针注入产物：写一个临时副本，末尾追加一段会写进 <title> 的脚本。
   用 --dump-dom 读回 title 即可拿到状态，无需 CDP。 */
function makeProbeCopy(srcFile, t) {
  let h = fs.readFileSync(srcFile, "utf8");
  const probe = `
<script>
window.addEventListener('load', () => {
  setTimeout(() => {
    const r = ${PROBE_JS};
    document.title = 'IVHPROBE' + r;
  }, 260);
});
</script>
`;
  h = h.replace(/<\/body>/i, probe + "</body>");
  const tmp = path.join(outDir, `.probe-${String(t).replace(".", "_")}.html`);
  fs.writeFileSync(tmp, h, "utf8");
  return tmp;
}

const runBrowser = (args, timeout = 60000) => {
  try {
    return execFileSync(BROWSER, args, {
      encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (e) {
    return (e.stdout || "") + (e.stderr || "");
  }
};

const results = [];
for (const t of times) {
  const probeFile = makeProbeCopy(FILE, t);
  const userDir = path.join(os.tmpdir(), `ivh-shot-${process.pid}-${t}`.replace(/\./g, "_"));
  const url = "file:///" + probeFile.replace(/\\/g, "/").replace(/ /g, "%20")
            + (BASE === "timeline" ? `?t=${t}` : `#${Number(t) + 1}`);

  const common = [
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-background-networking",
    `--user-data-dir=${userDir}`,
    `--window-size=${SIZE.w},${SIZE.h}`,
    `--force-device-scale-factor=${SCALE}`,
    "--virtual-time-budget=5200",
    /* ★ 关键：BG=transparent 时必须显式指定透明底色，否则 headless 默认铺白，
       截出的 PNG 是 colorType=2（无 alpha 通道），核对时看到的"白底"其实是实心白，
       会让人误判透明降级是对的。 */
    ...(BG === "transparent" ? ["--default-background-color=00000000"] : []),
  ];

  /* 1) 截图 */
  const png = path.join(outDir, `${name}-t${String(t).replace(".", "_")}.png`);
  runBrowser([...common, `--screenshot=${png}`, url]);
  const gotShot = fs.existsSync(png);
  const size = gotShot ? fs.statSync(png).size : 0;

  /* 2) 探针（同一 URL，再跑一次读 DOM） */
  let probe = null;
  const dom = runBrowser([...common, "--dump-dom", url], 45000);
  const m = dom.match(/<title>IVHPROBE(\{[\s\S]*?\})<\/title>/);
  if (m) { try { probe = JSON.parse(m[1]); } catch {} }

  /* 清理临时用户目录 */
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {}

  results.push({ t, png: gotShot ? png : null, size, probe });
  const inC = probe ? probe.inCount : "?";
  const tot = probe ? probe.total : "?";
  const list = probe && probe.inList.length ? probe.inList.join(" ") : "-";
  console.log(`  ${gotShot ? "●" : "✗"} t=${String(t).padStart(6)}s  in=${inC}/${tot}  ${list}  (${(size / 1024).toFixed(1)} KB)`);
}

/* 清理临时探针副本 */
for (const f of fs.readdirSync(outDir)) {
  if (f.startsWith(".probe-")) fs.rmSync(path.join(outDir, f), { force: true });
}

/* ---------- 核对页 ---------- */
const cards = results.map(r => `
  <figure>
    <figcaption>t = ${r.t}s <b>in=${r.probe ? r.probe.inCount : "?"}/${r.probe ? r.probe.total : "?"}</b><i>${(r.size / 1024).toFixed(1)} KB</i></figcaption>
    ${r.png ? `<img src="${path.basename(r.png)}" alt="t=${r.t}s" loading="lazy">` : `<div class="noshot">截图失败</div>`}
    <pre>${r.probe ? JSON.stringify(r.probe) : "（未取到探针）"}</pre>
  </figure>`).join("\n");

const pageFile = path.join(outDir, `${name}-at-shots.html`);
fs.writeFileSync(pageFile, `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>按秒截图 · ${name}</title>
<style>
  :root{--ink:#2E2823;--paper:#F2EDE4;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--paper);color:var(--ink);padding:30px 26px 46px;
    font:400 15px/1.6 system-ui,"Microsoft YaHei",sans-serif;}
  h1{font-size:23px;margin-bottom:6px;}
  p.sub{opacity:.7;font-size:13.5px;margin-bottom:22px;}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:22px;max-width:1600px;}
  @media(max-width:820px){.grid{grid-template-columns:1fr;}}
  figure{background:#fff;border:2px solid var(--ink);
    border-radius:13px 6px 15px 7px/7px 15px 6px 13px;
    box-shadow:6px 7px 0 rgba(46,40,35,.13);overflow:hidden;}
  figcaption{padding:9px 13px;border-bottom:2px solid rgba(46,40,35,.14);
    font-size:12.5px;font-family:ui-monospace,Consolas,monospace;display:flex;gap:10px;align-items:center;}
  figcaption b{color:#C0392B;} figcaption i{margin-left:auto;font-style:normal;font-size:11.5px;opacity:.6;}
  figure img{display:block;width:100%;height:auto;background:#111;}
  .noshot{padding:40px;text-align:center;background:#fdd;font-size:13px;}
  figure pre{padding:8px 13px;font-size:11px;opacity:.72;white-space:pre-wrap;
    border-top:2px solid rgba(46,40,35,.1);font-family:ui-monospace,Consolas,monospace;}
</style></head><body>
<h1>按秒截图 · ${name}</h1>
<p class="sub">每个时刻一张，通过 <code>${BASE === "timeline" ? "?t=&lt;秒&gt;" : "#幕号"}</code> 定位。
用于核对「组件是否严格在该秒才出现」以及同泊位是否撞车。<br>
<code>in</code> = 该时刻处于在场状态的组件数，应等于你预期的数量。</p>
<div class="grid">${cards}
</div>
</body></html>`);

console.log(`\n[shoot-at] 截图 ${results.filter(r => r.png).length}/${results.length} 张 -> ${outDir}`);
console.log(`[shoot-at] 核对页 -> ${pageFile}`);
console.log(pageFile);
