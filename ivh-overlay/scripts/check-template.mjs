#!/usr/bin/env node
/**
 * check-template.mjs —— ivh-overlay（透明素材）产物十一项自检
 *
 * 用法：node scripts/check-template.mjs <产物.html>
 * 退出码：0 = 全过（允许 note）；1 = 有 FAIL
 *
 * 十一项：
 *   1 标签闭合        2 外部依赖        3 变量契约        4 透明反色
 *   5 素材模式锁定    6 渲染兼容标记    7 CSS 括号平衡    8 风格结构差异
 *   9 素材点时间轴   10 素材点规模     11 屏幕字规范
 *
 * 与 ivh-standalone 的同名脚本差别：这里没有幕（scene）、没有泊位（data-safe）、
 * 没有 A/B roll 泳道。判据全部围绕"一块板 + 组间透明空档"。
 */

import fs from "node:fs";
import path from "node:path";

/* ---------- CLI ---------- */
const argv = process.argv.slice(2);
const FILE = argv.find(a => !a.startsWith("-"));
const QUIET = argv.includes("--quiet");
if (!FILE) {
  console.error("用法: node scripts/check-template.mjs <产物.html>");
  process.exit(1);
}
const abs = path.resolve(FILE);
if (!fs.existsSync(abs)) {
  console.error("文件不存在: " + abs);
  process.exit(1);
}
const src = fs.readFileSync(abs, "utf8");

/* ---------- 输出工具 ---------- */
const OUT = [];
let fails = 0, notes = 0;
const push  = s => OUT.push(s);
const head  = s => push("\n== " + s + " ==");
const ok    = s => push("  OK   " + s);
const fail  = s => { fails++; push("  FAIL " + s); };
const note  = s => { notes++; push("  note " + s); };
const skip  = s => push("  skip " + s);

/* 去掉注释后的代码。
   ★ 必须整段删除（保留换行以维持行号），不能只把内容换成空格 ——
     否则「注释里的 <section> / <div class="comp">」仍会被标签计数命中。
   这里同时剥掉 HTML 注释与 /* *\/ 注释，得到可用于结构分析的 code。 */
const stripH = s => s.replace(/<!--[\s\S]*?-->/g, m => "\n".repeat((m.match(/\n/g) || []).length));
const code = stripH(src).replace(/\/\*[\s\S]*?\*\//g, m => "\n".repeat((m.match(/\n/g) || []).length));
/* 结构分析用的 code（不含 <style> 内 CSS，避免 CSS 注释里的示例干扰脚本检测） */
const codeNoCss = (() => {
  const i = code.indexOf("<style");
  const j = code.indexOf("</style>");
  if (i < 0 || j < 0) return code;
  const s = code.slice(0, code.indexOf(">", i) + 1);
  const e = code.slice(j);
  return s + "\n".repeat(code.slice(0, j).split("\n").length) + e;
})();

/* 提前解析 CONFIG 的 STYLE / BASE / PURPOSE —— 多个检查项都要用。
   顺序上第 5 项才正式校验，这里只为后续项提供取值。 */
const cfgRaw = (() => {
  const i = code.indexOf("const CONFIG");
  if (i < 0) return "";
  const j = code.indexOf("{", i);
  let depth = 0;
  for (let k = j; k < code.length; k++) {
    if (code[k] === "{") depth++;
    else if (code[k] === "}") { depth--; if (depth === 0) return code.slice(j + 1, k); }
  }
  return "";
})();
const cfgStr = k => { const m = cfgRaw.match(new RegExp("\\b" + k + "\\s*:\\s*'([^']*)'")); return m ? m[1] : null; };
const STYLE_NAME = cfgStr("STYLE");
const RATIO      = cfgStr("RATIO");
const PURPOSE    = cfgStr("PURPOSE");
const BASE       = cfgStr("BASE");

/* 本技能只产出「素材模式」这一种形态，所以这里不分支：
   一块 3:4 的板 · 一组元素 · 不写 data-safe · 组间留纯透明空档。
   所有与"整屏叠加/独立成片"有关的判据都已从本脚本移除。 */
const KIND_LABEL = "素材模式（3:4 一块板）";

/* ---------- 结构化小工具：按标签配对取出元素内部 ----------
   ★ 不能用 /<div[^>]*>([\s\S]*?)<\/div>/ —— 非贪婪会在第一个内层 </div>
     就截断，组件里的嵌套结构会被腰斩。必须走深度配对。 */
const VOID_TAGS = new Set(["br","img","hr","input","meta","link","source",
  "path","circle","rect","line","polyline","polygon","ellipse","stop","use"]);
function blockOf(str, startIdx) {
  const openEnd = str.indexOf(">", startIdx);
  if (openEnd < 0) return "";
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
  re.lastIndex = openEnd + 1;
  let m, depth = 1;
  while ((m = re.exec(str))) {
    const close = m[1], tag = m[2].toLowerCase(), selfClose = m[3];
    if (VOID_TAGS.has(tag)) continue;
    if (close) { depth--; if (depth === 0) return str.slice(openEnd + 1, m.index); }
    else if (!selfClose) depth++;
  }
  return str.slice(openEnd + 1);
}
/* 某类名的所有「元素内部」 */
const blocksOf = (cls, hay = codeNoCss) => {
  const re = new RegExp(`<[a-zA-Z][^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, "g");
  const out = []; let m;
  while ((m = re.exec(hay))) out.push(blockOf(hay, m.index));
  return out;
};
/* 顶层子元素个数（深度 0 的开标签计数） */
function topLevelTagCount(inner) {
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
  let m, depth = 0, n = 0;
  while ((m = re.exec(inner))) {
    const close = m[1], tag = m[2].toLowerCase(), selfClose = m[3];
    if (VOID_TAGS.has(tag)) continue;
    if (close) { depth--; continue; }
    if (depth === 0) n++;
    if (!selfClose) depth++;
  }
  return n;
}
/* 元素里的纯文本叶子（屏幕字就是这些）。
   ★ 有些组件内部没有子标签（<span class="c-capsule">渠道下沉</span>），
     这时整块内部就是一条文案，不能因为"没匹配到标签"而漏检。 */
function leafTexts(inner) {
  const out = []; let m;
  const re = /<[a-zA-Z][^>]*>([^<]+)<\/[a-zA-Z]+>/g;
  while ((m = re.exec(inner))) {
    const t = m[1].replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  if (!out.length) {
    const bare = inner.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (bare) out.push(bare);
  }
  return out;
}

/* 一个素材点里有几个"元素"。
   关系型组件（c-flow / c-stack / c-cmp）自带元素块，要数块、不是数组件 ——
   一个 c-stack 装 4 层，就是 4 个元素，不是 1 个。

   ★ 不能写成"整块里有没有关系型组件 → 有就只数块"：
       <div class="comp">
         <div class="c-stack">…1 层…</div>      ← 1 个元素
         <span class="c-kw">另一块</span>        ← 1 个元素
       </div>
     上面这块实际是 2 个元素，只数块会得出 1，把超额的情况漏掉。
     正解是逐个顶层子元素判断：关系型组件展开成它的块，其余各自算 1 个。 */
const REL_CLASSES = ["st", "ar", "ly", "side", "vs"];
const relBlockCount = inner =>
  REL_CLASSES.reduce((n, c) => n + (inner.match(new RegExp(`class="[^"]*\\b${c}\\b`, "g")) || []).length, 0);

function elementCount(compInner) {
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>/g;
  let m, depth = 0, n = 0;
  while ((m = re.exec(compInner))) {
    const close = m[1], tag = m[2].toLowerCase(), attrs = m[3] || "", selfClose = m[4];
    if (VOID_TAGS.has(tag)) continue;
    if (close) { depth--; continue; }
    if (depth === 0) {
      if (/\b(c-flow|c-stack|c-cmp)\b/.test(attrs)) {
        const inner = blockOf(compInner, m.index);
        /* 关系层是空的话（还没写内容），至少要算 1，否则新写的骨架会被当成 0 元素 */
        n += Math.max(relBlockCount(inner), 1);
      } else {
        n++;
      }
    }
    if (!selfClose) depth++;
  }
  return n;
}
const textLen = s => [...s].filter(ch => !/\s/.test(ch)).length;

/* ==========================================================================
   1 · 标签闭合（用剥掉注释的 code，避免注释里的文档示例被计数）
   ========================================================================== */
head("1. 标签闭合");
for (const tag of ["div", "style", "script", "section", "svg", "body", "html", "head"]) {
  const open  = (codeNoCss.match(new RegExp("<" + tag + "(?=[\\s>/])", "g")) || []).length;
  const close = (codeNoCss.match(new RegExp("</" + tag + ">", "g")) || []).length;
  const selfClose = (codeNoCss.match(new RegExp("<" + tag + "[^>]*/>", "g")) || []).length;
  if (open === 0 && close === 0) continue;
  if (open === close + selfClose) ok(`${tag.padEnd(8)} open=${open} close=${close}`);
  else fail(`${tag.padEnd(8)} 不闭合 (open=${open} close=${close} self=${selfClose})`);
}

/* ==========================================================================
   2 · 外部依赖（单文件铁律）
   ========================================================================== */
head("2. 外部依赖");
const noData = code.replace(/data:[^"')\s]+/g, "");
const httpRefs = (noData.match(/https?:\/\//g) || []).length;
httpRefs === 0 ? ok("http(s) 引用数 = 0（已排除 data: URI）")
               : fail(`存在 ${httpRefs} 处 http(s) 引用，须改为内联`);

const resRefs = (code.match(/\b(?:src|href)\s*=\s*["'](?!#|data:)([^"']+)["']/g) || []);
resRefs.length === 0 ? ok("src/href 资源引用 = 0")
                     : fail(`存在 ${resRefs.length} 处资源引用: ${resRefs.slice(0,3).join(" | ")}`);

const imports = (code.match(/@import/g) || []).length;
imports === 0 ? ok("@import = 0") : fail(`@import 出现 ${imports} 次`);

const fontFace = (code.match(/@font-face/g) || []).length;
if (fontFace) note(`@font-face ${fontFace} 处 —— 确认字体已 base64 内联`);

/* ==========================================================================
   3 · 变量契约
   ========================================================================== */
head("3. 变量契约");

/* :root 块里的变量定义（在 CSS 里找，注意 CSS 已被剥出 code） */
const css = (() => {
  const i = code.indexOf("<style");
  const j = code.indexOf("</style>");
  return (i < 0 || j < 0) ? code : code.slice(code.indexOf(">", i) + 1, j);
})();
const rootBlock = (() => {
  const i = css.indexOf(":root");
  if (i < 0) return "";
  let depth = 0, j = css.indexOf("{", i);
  for (let k = j; k < css.length; k++) {
    if (css[k] === "{") depth++;
    else if (css[k] === "}") { depth--; if (depth === 0) return css.slice(j + 1, k); }
  }
  return "";
})();
const rootVars = [...new Set((rootBlock.match(/--[a-z0-9-]+/g) || []))];
push(`  :root 共 ${rootVars.length} 个变量：${rootVars.join(" ")}`);

/* 必须存在的核心变量 */
const CORE = ["--page-bg","--paper","--ink","--c1","--c2","--c3","--card-bg","--card-fill","--bar-fill","--stroke","--radius","--shadow"];
const missing = CORE.filter(v => !rootVars.includes(v));
missing.length === 0 ? ok(`核心变量齐备（${CORE.length} 个）`)
                     : fail(`缺核心变量: ${missing.join(" ")}`);

/* 六风格覆写块（在纯 CSS 中查找；doodle 可无块，视为默认） */
const styleBlocks = {};
{
  const re = /html\[data-style="([a-z0-9-]+)"\]\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(css))) {
    const [, name, body] = m;
    if (!styleBlocks[name]) styleBlocks[name] = new Set();
    (body.match(/--[a-z0-9-]+/g) || []).forEach(v => styleBlocks[name].add(v));
  }
}
const styleNames = Object.keys(styleBlocks);
if (styleNames.length === 0) note("未检测到任何风格覆写块（仅默认风格）");
else {
  push(`  检测到风格 ${styleNames.length} 个：${styleNames.join(" | ")}`);
  for (const n of styleNames) {
    const inherits = CORE.filter(v => !styleBlocks[n].has(v));
    note(`${n.padEnd(10)} 变量层自定义 ${styleBlocks[n].size} 个，继承默认值: ${inherits.join(" ") || "（无）"}`);
  }
}

/* ==========================================================================
   4 · 透明版反色降级
   ========================================================================== */
head("4. 透明版反色降级");
const DARK_STYLES = ["blueprint", "neon", "pixel"];
for (const n of styleNames) {
  if (!DARK_STYLES.includes(n)) continue;
  /* 找 html.bg-transparent[data-style="n"] 块（在纯 CSS 里） */
  const re = new RegExp(`html\\.bg-transparent\\[data-style="${n}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`, "g");
  const mm = re.exec(css);
  if (!mm) { fail(`${n} 为深色风格，但缺少透明背景反色降级块`); continue; }
  const hasInk = /--ink\s*:/.test(mm[1]);
  hasInk ? ok(`${n.padEnd(10)} 深色风格，已有透明背景反色降级`)
         : fail(`${n.padEnd(10)} 降级块未覆写 --ink，文字可能看不清`);
}
const lightStyles = styleNames.filter(n => !DARK_STYLES.includes(n));
for (const n of lightStyles) ok(`${n.padEnd(10)} ink 为深色，无需降级`);
if (!styleNames.length && !/bg-transparent/.test(css)) skip("无风格块，本项不适用");

/* ==========================================================================
   5 · CONFIG 五维取值
   ========================================================================== */
head("5. CONFIG 五维取值");
const cfgBlock = cfgRaw;
if (!cfgBlock) { fail("找不到 CONFIG 对象"); }
else {
  const pick = key => {
    const m = cfgBlock.match(new RegExp("\\b" + key + "\\s*:\\s*'([^']*)'"));
    return m ? m[1] : null;
  };
  const pickBool = key => {
    const m = cfgBlock.match(new RegExp("\\b" + key + "\\s*:\\s*(true|false)"));
    return m ? m[1] : null;
  };
  const VALID = {
    PURPOSE: ["standalone", "overlay"],
    BASE   : ["text", "timeline"],
    BG     : ["opaque", "transparent"],
    RATIO  : ["16:9", "9:16", "4:3", "3:4"],
    STYLE  : ["doodle", "riso", "blueprint", "minimal", "neon", "pixel"],
  };
  const got = {};
  for (const [key, allowed] of Object.entries(VALID)) {
    const v = pick(key);
    got[key] = v;
    if (v && allowed.includes(v)) ok(`${key.padEnd(8)} '${v}'`);
    else fail(`${key.padEnd(8)} '${v}' 非法（可选 ${allowed.join(" | ")}）`);
  }
  const ANIMATE = pickBool("ANIMATE");
  const HIDE_HUD = pickBool("HIDE_HUD");

  /* 本技能只产出透明素材，四个维度都必须锁在素材这一档上。
     改了就不是这个技能的产物了 —— 独立成片归 ivh-standalone。 */
  const FIXED = { PURPOSE: "overlay", BASE: "timeline", BG: "transparent", RATIO: "3:4" };
  for (const [key, want] of Object.entries(FIXED)) {
    if (got[key] === want) ok(`${key.padEnd(8)} 锁定在 '${want}'（素材模式）`);
    else fail(`${key.padEnd(8)} = '${got[key]}' —— 透明素材必须为 '${want}'，否则产物不是素材贴片`);
  }

  if (HIDE_HUD !== "true") fail("HIDE_HUD 必须为 true —— HUD 与进度条被拍进透明素材就废了");
  else ok("HIDE_HUD true（HUD / 快捷键提示 / 进度条全部隐藏）");
  if (ANIMATE === "false") note("ANIMATE=false —— 静态布局确认模式，无动画。出片前记得改 true");

  /* 旧字段 MODE 已废弃 */
  if (/\bMODE\s*:/.test(cfgBlock)) fail("检测到已废弃字段 MODE，请迁移为 PURPOSE/BASE/BG/RATIO");
}

/* ==========================================================================
   6 · 渲染兼容标记
   ========================================================================== */
head("6. 渲染兼容标记");
const compId = (src.match(/data-composition-id/g) || []).length;
const dataHud = (src.match(/data-hud/g) || []).length;
compId >= 1 ? ok(`data-composition-id 出现 ${compId} 次`) : fail("缺少 data-composition-id，无法配对 html-transparent-video 渲染");
dataHud >= 1 ? ok(`data-hud 出现 ${dataHud} 次`) : fail("缺少 data-hud，渲染器无法识别是否隐藏 HUD");
/* HIDE_HUD 必须把 #hud 页码 / #kbd 提示 / #bar 进度条 三样都藏起来。
   ★ 只藏 #hud 是个真踩过的坑：时间轴模式下 #bar 会按 ?t= 显示成一条彩色
     进度条钉在画面底部，透明素材叠到实拍上一眼可见 —— 整个素材就废了。 */
{
  const hideBlock = (code.match(/CONFIG\.HIDE_HUD[\s\S]{0,400}?\n\}/) || [""])[0];
  if (!hideBlock && !/HIDE_HUD/.test(code)) {
    note("代码里没有 HIDE_HUD 的处理逻辑 —— 导出透明素材前记得手工藏掉 HUD");
  } else {
    const hasKbd = /['"]#?kbd['"]/.test(hideBlock);
    const hasBar = /['"]#?bar['"]/.test(hideBlock);
    (hasKbd && hasBar) ? ok("HIDE_HUD 同时隐藏 #hud / #kbd / #bar（透明素材底部不会留进度条）")
                       : fail(`HIDE_HUD 只藏了 ${[hasKbd ? "" : "#kbd", hasBar ? "" : "#bar"].filter(Boolean).join(" 与 ")} —— 透明导出会被拍到画面里`);
  }
}
/* 尺寸与时长自同步 */
const hasW = /dataset\.width\s*=/.test(code);
const hasH = /dataset\.height\s*=/.test(code);
const hasD = /dataset\.duration\s*=/.test(code);
(hasW && hasH && hasD) ? ok("合成根自同步尺寸与时长（width/height/duration）")
                       : fail(`合成根自同步不完整 (w=${hasW} h=${hasH} dur=${hasD})`);

/* ==========================================================================
   7 · CSS 括号平衡
   ========================================================================== */
head("7. CSS 括号平衡");
{
  const o = (css.match(/\{/g) || []).length;
  const c = (css.match(/\}/g) || []).length;
  if (!css.trim()) fail("找不到 <style> 块");
  else o === c ? ok(`{ ${o} / } ${c}`) : fail(`CSS 括号不平衡 (open=${o} close=${c})`);
}

/* ==========================================================================
   8 · 风格结构差异
   ========================================================================== */
head("8. 风格结构差异");
{
  const styles = styleNames.length ? styleNames : ["doodle"];
  /* 判定这是「模板」还是「产物」：
     模板内含全部六风格的覆写块（供切换）；产物只落实一种风格。
     单风格产物不应因「风格雷同」而 FAIL，只给提示。 */
  const ALL_STYLES = ["doodle", "riso", "blueprint", "minimal", "neon", "pixel"];
  const isTemplate = styleNames.length >= 5;
  const singleStyle = !isTemplate && styleNames.length <= 1;

  /* 把「区块 3-B 结构层」按风格切段。
     CSS 里同一风格的多条规则是连续的（如 riso 的 .card / ::after / .c-capsule），
     段 = 从该风格首次出现，到下一个「不同风格名」首次出现为止。
     注意：html.bg-transparent[data-style="x"] 属于透明降级段，不算结构层。 */
  const styleAnchors = [...css.matchAll(/html\[data-style="([a-z0-9-]+)"\]/g)]
    .map(m => ({ name: m[1], idx: m.index }));
  const structSeg = name => {
    const idxs = styleAnchors.filter(a => a.name === name).map(a => a.idx);
    if (!idxs.length) return "";
    const start = idxs[0];
    const next = styleAnchors.find(a => a.idx > start && a.name !== name);
    const end = next ? next.idx : css.length;
    return css.slice(start, end);
  };

  let structOk = 0;
  const fingerprints = [];
  for (const n of styles) {
    const seg = structSeg(n);
    const hasOwnRule = new RegExp(`html\\[data-style="${n}"\\]\\s*[^,{]*\\{`).test(seg);
    const props = hasOwnRule ? (seg.match(/[a-z-]+\s*:/g) || []).length : 0;
    if (props > 0) structOk++;
    fingerprints.push({ name: n, props, seg, hasOwnRule });
  }

  if (isTemplate) {
    structOk >= 2 ? ok(`有结构差异的风格 ${structOk}/${styles.length} 个`)
                  : fail(`只有 ${structOk} 个风格有结构覆写，各风格会雷同`);
  } else if (singleStyle) {
    note(`单风格产物（STYLE='${STYLE_NAME}'），本项不要求多风格差异 —— 跳过`);
  } else {
    structOk >= 1 ? ok(`有结构差异的风格 ${structOk}/${styles.length} 个`)
                  : note(`风格 ${styles.join("/")} 均无结构覆写`);
  }

  /* 关键能力维度核对 */
  const CAPS = [
    ["外形/轮廓", /border|outline|clip-path/],
    ["光泽/发光", /glow|text-shadow|box-shadow/],
    ["投影",      /box-shadow/],
    ["纹理",      /::after|::before|background-image|repeating-linear|radial-gradient/],
    ["排版",      /font|letter-spacing/],
    ["节奏",      /animation|transition/],
    ["SVG 笔画",  /stroke/],
    ["计数编号",  /counter/],
    ["专属动效",  /animation-name|animation:/],
    ["透明版取舍",/bg-transparent/],
    ["混合模式",  /mix-blend-mode|backdrop-filter/],
  ];
  const structFingerprints = new Set();
  for (const f of fingerprints) {
    if (f.props === 0) { note(`${f.name.padEnd(10)} 无预设块（默认风格，只靠 :root 值 + 通用结构）`); continue; }
    const hit = CAPS.filter(([, rx]) => rx.test(f.seg)).map(([k]) => k);
    note(`${f.name.padEnd(10)} 属性 ${String(f.props).padStart(3)} 个 · 能力维 ${hit.length}/${CAPS.length} · ${hit.join("/") || "（无）"}`);
    structFingerprints.add(hit.join(","));
  }
  if (structFingerprints.size >= 2)
    ok(`结构指纹各不相同（${structFingerprints.size}/${fingerprints.filter(f => f.props > 0).length} 种不同组合）`);

  /* 专属入场动效种类。
     模板要求 ≥4（六风格动画手感要拉开）；产物只要求 ≥3（够用即可）。 */
  const anims = [...new Set((css.match(/@keyframes\s+([a-z-]+)/g) || []).map(s => s.replace("@keyframes", "").trim()))];
  const need = isTemplate ? 4 : 3;
  if (anims.length >= need) ok(`专属入场动效 ${anims.length} 种：${anims.join(" / ")}`);
  else fail(`入场动效只有 ${anims.length} 种不同 keyframes（需 ≥${need}），动画手感雷同`);
}

/* ==========================================================================
   9 · 素材点时间轴
   --------------------------------------------------------------------------
   三条硬线：
     · 任意两个素材点的时间区间不得重叠 —— 一块板上同一时刻只有一组元素
     · 相邻素材点之间留 >=1.5s 纯透明空档 —— 连续铺满就变成"第二块屏"了
     · 每个素材点停留 >=0.8s —— 观众来不及看
   再给两条软提示：呼应密度、入场动效多样性。
   ========================================================================== */
head("9. 素材点时间轴");

if (BASE !== "timeline") {
  skip(`BASE='${BASE}'，本项不适用`);
} else {
  /* 组件：用剥掉注释的 code，避免 TL_DEMO 注释块里的示例被误认为真实组件 */
  const compTags = (codeNoCss.match(/<div[^>]*class="[^"]*\bcomp\b[^"]*"[^>]*>/g) || []);
  push(`  形态 ${KIND_LABEL} · 检测到素材点 ${compTags.length} 个`);

  if (compTags.length === 0) {
    fail("BASE='timeline' 但一个 .comp 组件都没有");
  } else {
    const comps = compTags.map(t => {
      const get = k => { const m = t.match(new RegExp("data-" + k + '="([^"]*)"')); return m ? m[1] : null; };
      return {
        in:  get("in")  === null ? null : parseFloat(get("in")),
        out: get("out") === null ? null : parseFloat(get("out")),
        safe: get("safe"),
        anim: get("anim") || "MASK-UP",
        raw: t,
      };
    });

    const missIn  = comps.filter(c => c.in  === null || Number.isNaN(c.in));
    const missOut = comps.filter(c => c.out === null || Number.isNaN(c.out));
    missIn.length  === 0 ? ok("data-in  缺失 0 个")  : fail(`data-in  缺失 ${missIn.length} 个`);
    missOut.length === 0 ? ok("data-out 缺失 0 个") : fail(`data-out 缺失 ${missOut.length} 个`);

    if (missIn.length === 0 && missOut.length === 0) {
      /* 反向校验：out 必须大于 in */
      comps.forEach((c, i) => {
        if (c.out <= c.in) fail(`第 ${i + 1} 个组件 data-out(${c.out}) 不大于 data-in(${c.in})`);
      });

      /* —— 素材点重叠：一块板上同一时刻只能有一组元素 —— */
      const sorted = [...comps].sort((a, b) => a.in - b.in);
      let ov = 0;
      for (let i = 0; i < sorted.length; i++)
        for (let j = i + 1; j < sorted.length; j++) {
          const a = sorted[i], b = sorted[j];
          if (a.in < b.out && b.in < a.out) {
            ov++;
            fail(`素材点时间重叠：${a.in}-${a.out}s 与 ${b.in}-${b.out}s —— 一块板上同一时刻只能有一组元素`);
          }
        }
      if (ov === 0) ok("素材点时间重叠 0 处（同一时刻只有一组元素）");

      /* 相邻素材点 >=1.5s 纯透明空档 —— 连续铺满会让叠加层变成"第二块屏"。
         区间已经重叠的不必再报空档（上一条 FAIL 已经说清楚了），否则会连着刷两条。 */
      let tight = 0;
      for (let i = 1; i < sorted.length; i++) {
        const gap = +(sorted[i].in - sorted[i - 1].out).toFixed(3);
        if (gap >= 0 && gap < 1.5) {
          tight++;
          fail(`相邻素材点空档只有 ${gap}s（需 >=1.5s）：${sorted[i - 1].out}s → ${sorted[i].in}s`);
        }
      }
      if (sorted.length > 1 && tight === 0 && ov === 0)
        ok(`相邻素材点空档均 >=1.5s（共 ${sorted.length - 1} 处，最短 ${Math.min(...sorted.slice(1).map((c, i) => +(c.in - sorted[i].out).toFixed(3)))}s）`);
      if (sorted.length === 1) note("只有 1 个素材点 —— 60s 口播建议 8~12 个呼应点");

      /* 素材点不用泊位 */
      const withSafe = comps.filter(c => c.safe).length;
      if (withSafe) note(`${withSafe} 个素材点写了 data-safe —— 板由用户自己摆，"避开中央"没有参照物，这个属性不生效，删掉`);

      /* 时间跨度 vs 素材点数：呼应密度 */
      const span = sorted.length > 1 ? sorted[sorted.length - 1].out - sorted[0].in : 0;
      if (span > 0) {
        const per60 = (sorted.length / span * 60).toFixed(1);
        note(`呼应密度约 ${per60} 个 / 60s（素材点 ${sorted.length} 个，跨度 ${span.toFixed(1)}s）—— 60s 口播建议 8~12 个`);
      }

      /* 停留时长 */
      const short = comps.filter(c => (c.out - c.in) < 0.8);
      short.length === 0 ? ok("停留 >= 0.8s")
                         : fail(`${short.length} 个组件停留 < 0.8s，观众来不及看`);

      /* 组合入场动效多样性（组合是各组件动效的集合） */
      const set = [...new Set(comps.map(c => c.anim))];
      set.length >= 3 ? ok(`用到 ${set.length} 种入场动效：${set.join(" / ")}`)
                      : note(`只用到 ${set.length} 种入场动效：${set.join(" / ")} —— 建议 >=3 避免单调`);

      /* 时间轴总长 */
      const dur = Math.max(...comps.map(c => c.out));
      note(`时间轴总长 ${dur}s（= 最大 data-out，模板会自动写入 data-duration）`);
    }
  }
}

/* ==========================================================================
   10 · 素材点规模
   --------------------------------------------------------------------------
   一块板上放一组元素：≤3 个顶层元素（含它们之间的关系层）。
   超过 3 个，1080x1440 的板就挤了 —— 观众一眼抓不住重点，
   而且贴到实拍上会盖住一大片。宁可拆成两个素材点。

   为什么是"顶层元素"而不是"字"：3:4 的纵向关系靠组块之间的
   位置承担（上→下、左→右），顶层块数一多，关系就读不出来了。
   ========================================================================== */
head("10. 素材点规模");

{
  const tags = [...codeNoCss.matchAll(/<div[^>]*class="[^"]*\bcomp\b[^"]*"[^>]*>/g)];
  if (!tags.length) {
    fail("一个 .comp 素材点都没有");
  } else {
    const over = [], detail = [], lonely = [];
    tags.forEach((m, i) => {
      const blk = blockOf(codeNoCss, m.index);
      const n = elementCount(blk);
      detail.push(n);
      if (n > 3) over.push(`第 ${i + 1} 个素材点 ${n} 个元素`);
      /* "孤立数字"的准确判据：只有一个顶层元素，且它内部只有 1 段文字。
         数据卡（大数字 + 归因标签）是 2 段文字，不算孤立，不该报警。 */
      if (n <= 1 && leafTexts(blk).length <= 1) lonely.push(`第 ${i + 1} 个`);
    });
    over.length === 0
      ? ok(`素材点 ${tags.length} 个，每组元素均 <=3（各 ${detail.join(" / ")} 个）`)
      : fail(`素材点元素超 3 个：${over.join(" · ")} —— 一块板上放不下，拆成两个素材点`);

    if (lonely.length)
      note(`${lonely.join(" ")} 素材点只有一段文字 —— 缺关系层（对照 / 起点值 / 箭头）。孤立的数字留不下印象`);

    /* max-width 存在性：防止元素撑破 3:4 画布本身（不是"防侵占中央"） */
    const compRule = /(^|\})\s*\.comp\s*(?:,[^{]*)?\{([\s\S]*?)\n\}/.exec(css);
    const hasW = compRule ? /max-width/.test(compRule[2]) : /\.comp\s*\{[\s\S]{0,400}?max-width/.test(css);
    hasW ? ok("素材点有 max-width 约束（不会撑破画布）")
         : fail("缺少 .comp 的 max-width，超长内容会溢出 3:4 画布");
  }
}

/* ==========================================================================
   11 · 屏幕字规范
   --------------------------------------------------------------------------
   屏幕字是"给眼睛看的"，不是口播稿的转录（见 references/two-track-text.md）：
       提示标签 <=6 字 · 信息卡 <=14 字/行 且 <=3 行 · 3:4 素材 <=3 元素
   这里能静态验的只有「字数」和「元素个数」—— 真正的换行行数要靠截图看。
   所以 14 字给 note（提醒核对换行），42 字（14x3）才是 fail 硬线。
   ========================================================================== */
head("11. 屏幕字规范");
{
  const BADGE = "c-capsule";                                     /* 提示标签 */
  const CARDS = ["c-kw", "c-note", "c-quote", "c-list",          /* 信息卡 */
                 "c-cmp", "c-flow", "c-stack", "c-data"];
  let hit = 0;

  /* 提示标签 */
  const badges = blocksOf(BADGE).flatMap(leafTexts);
  if (!badges.length) {
    skip("没有提示标签（c-capsule）");
  } else {
    hit++;
    const over = badges.filter(t => textLen(t) > 6);
    over.length === 0 ? ok(`提示标签 ${badges.length} 个，均 <=6 字（最长 "${badges.reduce((a, b) => textLen(b) > textLen(a) ? b : a)}" ${Math.max(...badges.map(textLen))} 字）`)
                      : fail(`提示标签超 6 字 ${over.length} 个：${over.map(t => `"${t}"(${textLen(t)}字)`).join(" ")} —— 那是短句，不是标签`);
  }

  /* 信息卡 */
  const cardTexts = [];
  for (const cls of CARDS) for (const inner of blocksOf(cls)) for (const t of leafTexts(inner)) cardTexts.push({ cls, t });
  if (!cardTexts.length) {
    skip("没有信息卡（c-kw / c-note / c-quote / c-cmp / c-flow / c-stack / c-data）");
  } else {
    hit++;
    const hard = cardTexts.filter(x => textLen(x.t) > 42);
    const soft = cardTexts.filter(x => textLen(x.t) > 14 && textLen(x.t) <= 42);
    hard.length === 0 ? ok(`信息卡 ${cardTexts.length} 条文字，均 <=42 字（3 行 x 14 字的硬上限）`)
                      : fail(`信息卡超 42 字 ${hard.length} 条：${hard.map(x => `"${x.t.slice(0, 18)}…"(${textLen(x.t)}字)`).join(" ")} —— 一定会超过 3 行`);
    if (soft.length) note(`信息卡 ${soft.length} 条文字在 15~42 字之间：${soft.map(x => `"${x.t.slice(0, 14)}…"(${textLen(x.t)}字)`).join(" ")} —— 请核对截图里是否 <=3 行`);
  }

  /* 素材元素个数上限 —— 归第 10 项（素材点规模），这里不重复 */

  if (hit === 0) note("没有可检的屏幕字 —— 确认产物里确实还没有内容");
}

/* ==========================================================================
   结论
   ========================================================================== */
push("\n== 结论 ==");
if (fails === 0) {
  push(`  自检通过。${notes ? `（${notes} 条提示）` : ""}`);
} else {
  push(`  ${fails} 项待处理：`);
  OUT.filter(l => l.startsWith("  FAIL")).forEach(l => push("   - " + l.slice(7)));
}

const text = OUT.join("\n");
if (!QUIET) console.log(text);
else OUT.filter(l => /FAIL|结论|自检/.test(l)).forEach(l => console.log(l));

process.exit(fails === 0 ? 0 : 1);
