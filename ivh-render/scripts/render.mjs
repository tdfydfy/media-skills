#!/usr/bin/env node
/**
 * render.mjs —— 产物 HTML → 视频（ivh-render 的主入口）
 *
 * 用法：
 *   node scripts/render.mjs <产物.html>
 *   node scripts/render.mjs <产物.html> --preset draft|normal|fine
 *   node scripts/render.mjs <产物.html> --step 0.1 --fps 30 --out <目录> --scale 2
 *   node scripts/render.mjs <产物.html> --preflight        # 只做出片前检查，不渲染
 *   node scripts/render.mjs <产物.html> --no-verify        # 跳过透明通道复检
 *   node scripts/render.mjs <产物.html> --no-reuse-blank   # 素材模式空档不复用（逐帧老实渲染）
 *
 * 它做三件事，按顺序：
 *   1) 前置检查 —— 读产物里的 CONFIG，把「出片必然出错」的组合挡下来（纯正则，毫秒级）
 *   2) 委托 shoot.mjs 抽帧 + ffmpeg 合成
 *   3) 透明产物自动跑 check-alpha.mjs 复检 alpha 平面（假透明是头号事故）
 *
 * ★ 这里没有「抽帧自查」这一步。
 *   出片是流水线的终点，"画面好不好"的判断在上一环就做完了 —— 用户直接看 HTML，
 *   看完点头才轮到这一步。截图不是检查手段，它是出片的生产方式本身。
 *   让 AI 反复抽帧看画面，等于把一个人的活干成了一台慢机器的事。
 *
 * 输出格式由产物自己的 CONFIG 决定，不靠命令行猜：
 *   BG='transparent' → ProRes 4444 / yuva444p10le / .mov（带 alpha）
 *   BG='opaque'      → H.264 / yuv420p / .mp4
 *
 * ★ 素材模式（透明 + 3:4）出片时，空档帧自动复用：
 *   它的时间轴大段是全透明的（规格就是 60s 做 8~12 个素材点），
 *   逐帧渲染那些空档等于白干 —— 实测空档帧在同一份产物里逐字节相同。
 *   所以只渲染「有内容」的帧 + 1 张空档帧，其余复用，成片画面一点不变。
 *   这里显示的帧数与耗时都按复用后的实际值算（与 shoot.mjs 共用同一份计划）。
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { samplePlan } from "./active-windows.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;

const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith("-")) {
  console.error("用法: node scripts/render.mjs <产物.html> [--preset draft|normal|fine] [--step 秒] [--fps N] [--out 目录] [--scale N] [--preflight] [--no-verify]");
  process.exit(1);
}
const FILE = path.resolve(argv[0]);
if (!fs.existsSync(FILE)) { console.error("文件不存在: " + FILE); process.exit(1); }

const has = k => argv.includes(k);
const getArg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

/* ---------- 读产物 CONFIG ---------- */
const html = fs.readFileSync(FILE, "utf8");
const cfgStr = k => (html.match(new RegExp("\\b" + k + "\\s*:\\s*'([^']*)'")) || [])[1];
const cfgBool = k => {
  const m = html.match(new RegExp("\\b" + k + "\\s*:\\s*(true|false)"));
  return m ? m[1] === "true" : null;
};
const PURPOSE  = cfgStr("PURPOSE") || "standalone";
const BASE     = cfgStr("BASE") || "text";
const BG       = cfgStr("BG") || "opaque";
const RATIO    = cfgStr("RATIO") || "16:9";
const STYLE    = cfgStr("STYLE") || "doodle";
const ANIMATE  = cfgBool("ANIMATE");
const HIDE_HUD = cfgBool("HIDE_HUD");

const bare = html.replace(/<!--[\s\S]*?-->/g, "");
const comps = [...bare.matchAll(/<div[^>]*class="[^"]*\bcomp\b[^"]*"[^>]*>/g)];
const outs = comps.map(m => {
  const mm = m[0].match(/data-out="([\d.]+)"/);
  return mm ? parseFloat(mm[1]) : 0;
});
/* 总时长按 BASE 分流：timeline 取 max(data-out)，text 累加 data-sec
   ★ class="…" 与 data-sec 之间有空隙，必须补 [^>]*，否则一个都匹配不到。 */
const sceneDur = [...bare.matchAll(/<section[^>]*class="[^"]*\bscene\b[^"]*"[^>]*data-sec="([\d.]+)"/g)]
  .reduce((n, m) => n + parseFloat(m[1]), 0);
const TL_DUR = outs.length ? Math.max(...outs) : 0;
const DURATION = BASE === "timeline" ? TL_DUR : sceneDur;

const TRANSPARENT = BG === "transparent";
const KIND = PURPOSE === "overlay"
  ? (RATIO === "3:4" ? "透明素材（3:4 一块板）" : "整屏透明叠加")
  : "独立成片";

/* ---------- 1 · 前置检查 ---------- */
console.log(`[render] ${path.basename(FILE)} · ${KIND} · ${RATIO} · ${STYLE} · ${BG}`);
console.log(`[render] ${BASE === "timeline" ? "时间轴" : "分幕"} ${
  BASE === "timeline" ? `${DURATION.toFixed(1)}s · 组件 ${comps.length} 个`
                      : `${DURATION.toFixed(1)}s · 幕 ${(bare.match(/<section[^>]*class="[^"]*\bscene\b/g) || []).length} 个`}`);

let block = 0, warn = 0;
const bad  = m => { block++; console.log("  ✗ " + m); };
const soft = m => { warn++;  console.log("  ! " + m); };
console.log("\n[render] 前置检查");

/* 两条排版路径都能出片：
   timeline —— 组件按 data-in/out 卡点，抽帧 ?t=
   text     —— 幕按 data-sec 轮播，抽帧同样走 ?t=（模板 10-C 段把全局秒数换算成
               「第 k 幕 + 幕内偏移」，用负 animation-delay + 暂停定格） */
if (DURATION <= 0) {
  bad(BASE === "timeline"
    ? "取不到时间轴总长（所有 data-out 都是 0）。"
    : "取不到总时长（每一幕的 data-sec 都缺失或为 0）。");
}
if (BASE === "timeline" && comps.length === 0) bad("BASE='timeline' 但一个 .comp 组件都没有，没有时间序列可渲染。");
if (BASE === "text" && !/<section[^>]*class="[^"]*\bscene\b/.test(bare)) bad("BASE='text' 但一个 .scene 都没有。");
if (ANIMATE !== true) soft("ANIMATE 不是 true —— 出片也不会有动画，只有布局。要动效请置 true。");
if (TRANSPARENT) {
  if (HIDE_HUD !== true) {
    bad("BG='transparent' 但 HIDE_HUD 不是 true —— #hud / #kbd / #bar 会被一并渲染进透明素材。"
      + " 底部那条进度条叠到实拍上非常显眼，必须置 true。");
  } else {
    console.log("  ✓ 透明产物且 HIDE_HUD=true（HUD 三件套已隐藏）");
  }
}
if (BASE === "timeline") {
  const noTime = comps.filter(m => !/data-in=/.test(m[0]) || !/data-out=/.test(m[0]));
  if (noTime.length) bad(`${noTime.length} 个组件缺 data-in / data-out，它们不会上场。`);
}
if (block === 0) console.log("  ✓ 无阻断项");
if (warn) console.log(`  （${warn} 条提醒）`);

if (has("--preflight")) {
  console.log(`\n[render] 仅检查，未渲染。${block ? "有 " + block + " 个阻断项需先修。" : "可以出片。"}`);
  process.exit(block ? 1 : 0);
}
if (block) {
  console.error("\n[render] 前置检查未通过，已中止。先修掉上面的 ✗ 再出片。");
  process.exit(1);
}

/* ---------- 2 · 决定抽帧密度 ---------- */
/* 采样密度 = 每秒采几张真实画面，直接决定运动顺不顺滑。
   成片一律输出恒定 30fps（--fps 可改）；采样不足的地方由容器保持帧。
   旧的 preset 值（0.5 / 0.1 / 0.04）会把成片做成 2fps / 10fps，交出去根本不像一条片子。 */
const PRESETS = { draft: 0.1, normal: 0.04, fine: 1 / 30 };
const preset = getArg("--preset", "normal");
let STEP = Number(getArg("--step", 0)) || 0;
if (STEP <= 0) {
  if (!(preset in PRESETS)) { console.error(`未知 preset: ${preset}（可选 ${Object.keys(PRESETS).join(" / ")}）`); process.exit(1); }
  STEP = PRESETS[preset];
}
const OUT_FPS    = Number(getArg("--fps", 0)) || 30;
const SAMPLE_FPS = +(1 / STEP).toFixed(2);
/* 素材模式（透明 + 3:4）出片时空档会被自动复用：真正渲染的只有「有内容的」那些帧。
   估值必须和实际一致，否则会把耗时说高一倍。 */
const plan = (TRANSPARENT && PURPOSE === "overlay" && RATIO === "3:4" && BASE === "timeline")
  ? samplePlan(html, DURATION, STEP) : null;
const reuseBlank = !!(plan && plan.blankT !== null) && !has("--no-reuse-blank");
const FRAMES_EST = plan ? plan.times.length : Math.floor(DURATION / STEP) + 2;
const RENDER_EST = reuseBlank ? plan.activeTimes.length + 1 : FRAMES_EST;
/* 两条抽帧引擎的实测单帧成本：单浏览器约 0.10s；逐帧浏览器约 1.1s */
const FAST_SEC = RENDER_EST * 0.10, SLOW_SEC = RENDER_EST * 1.1;
const fmt = s => s < 90 ? `${s.toFixed(0)}s` : `${(s / 60).toFixed(1)}min`;
console.log(`\n[render] 采样 ${SAMPLE_FPS}fps（step=${STEP.toFixed(3)}s）→ 约 ${FRAMES_EST} 帧 · 输出 ${OUT_FPS}fps CFR`);
if (reuseBlank) {
  const activeSec = plan.spans.reduce((n, s) => n + (s[1] - s[0]), 0);
  console.log(`[render] 素材模式：${plan.spans.length} 段有内容共 ${activeSec.toFixed(1)}s，`
    + `占时间轴 ${Math.round(100 * activeSec / Math.max(DURATION, 1e-6))}%`
    + ` → 只渲染 ${plan.activeTimes.length} 帧（+1 张空档帧），其余 ${FRAMES_EST - plan.activeTimes.length} 帧复用，画面不变`);
}
console.log(`[render] 预计耗时：单浏览器引擎约 ${fmt(FAST_SEC)}；回退到逐帧浏览器约 ${fmt(SLOW_SEC)}`);
if (SLOW_SEC > 900 && preset === "normal" && !has("--step")) {
  console.log(`  ! 帧数偏多。先用 --preset draft 出一版看效果，满意再出 ${preset}。`);
}

/* ---------- 3 · 委托 shoot.mjs 出片 ---------- */
const outDir = path.resolve(getArg("--out", path.join(path.dirname(FILE), "render-" + path.basename(FILE, ".html"))));
const args = [path.join(HERE, "shoot.mjs"), FILE, "--video", "--step", String(STEP), "--out", outDir, "--fps", String(OUT_FPS)];
const engine = getArg("--engine", "");
if (engine) args.push("--engine", engine);
if (has("--no-reuse-blank")) args.push("--no-reuse-blank");
const SCALE = Number(getArg("--scale", 0)) || 0;
if (SCALE > 0) args.push("--scale", String(SCALE));

console.log(`\n[render] 开始抽帧合成…（这一步就是出片本身，不是"检查"）`);
const r = spawnSync(NODE, args, { stdio: "inherit" });
if (r.status !== 0) {
  console.error("\n[render] shoot.mjs 失败。");
  process.exit(r.status || 1);
}

/* ---------- 4 · 定位产物 + 透明复检 ---------- */
const expect = path.join(outDir, TRANSPARENT
  ? path.basename(FILE, ".html") + "-alpha.mov"
  : path.basename(FILE, ".html") + ".mp4");
if (!fs.existsSync(expect)) {
  console.error(`\n[render] 没有找到预期产物：${expect}`);
  process.exit(1);
}
const mb = (fs.statSync(expect).size / 1048576).toFixed(2);
console.log(`\n[render] 产物 → ${expect}（${mb} MB）`);
console.log(`[render] 编码：${TRANSPARENT ? "ProRes 4444 / yuva444p10le（含 alpha）" : "H.264 / yuv420p"}`);

if (TRANSPARENT && !has("--no-verify")) {
  console.log("\n[render] 透明复检（抽 alpha 平面，不看 pix_fmt）");
  const v = spawnSync(NODE, [path.join(HERE, "check-alpha.mjs"), expect], { stdio: "inherit" });
  if (v.status !== 0) {
    console.error("\n[render] ✗ 透明复检未通过 —— 这份 .mov 的 alpha 不可用，不要直接拿去叠加。");
    console.error("  最常见原因：截图时漏了 --default-background-color=00000000（shoot.mjs 已内置，检查是否被改掉）。");
    process.exit(1);
  }
}

console.log(expect);
