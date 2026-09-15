#!/usr/bin/env node
/**
 * check-script.mjs —— 脚本文件契约校验（ivh-script 的交付闸门）
 *
 * 用法：node scripts/check-script.mjs <脚本.json>
 * 退出码：0 = 全过（允许 note）；1 = 有 FAIL
 *
 * 校验 script-format.md 第三节的 8 条硬规则。
 * 下游 ivh-standalone / ivh-overlay 拿到脚本后应先跑这一遍 ——
 * 上游没校验就交过来的脚本，在这里必须挡住，不要带病往下游走。
 */
import fs from "node:fs";

const FILE = process.argv[2];
if (!FILE) {
  console.error("用法：node scripts/check-script.mjs <脚本.json>");
  process.exit(2);
}

let fails = 0, notes = 0;
const ok   = m => console.log("  OK   " + m);
const fail = m => { fails++; console.log("  FAIL " + m); };
const note = m => { notes++; console.log("  note " + m); };
const head = m => console.log("\n== " + m + " ==");
const skip = m => console.log("  skip " + m);

/* ---------- 读入 ---------- */
let doc;
try {
  doc = JSON.parse(fs.readFileSync(FILE, "utf8").replace(/^\uFEFF/, ""));
} catch (e) {
  console.log("== 解析 ==\n  FAIL JSON 解析失败：" + e.message);
  console.log("\n== 结论 ==\n  1 项待处理：");
  console.log("  - JSON 解析失败");
  process.exit(1);
}

head("0. 解析");
ok("JSON 解析通过");
if (doc.version !== 1) note(`version=${doc.version}，本校验器按 v1 编写`);
else ok("version=1");

/* ---------- 1 · meta 必填 ---------- */
head("1. meta");
const m = doc.meta || {};
const PURPOSE = m.purpose;
const VALID_PURPOSE = ["standalone", "overlay"];
const VALID_RATIO   = ["16:9", "9:16", "4:3", "3:4"];
const VALID_BG      = ["opaque", "transparent"];
const VALID_STYLE   = ["doodle", "riso", "blueprint", "minimal", "neon", "pixel"];

["title", "purpose", "totalDuration", "ratio", "bg", "style"].forEach(k => {
  const v = m[k];
  if (v === undefined || v === null || v === "") fail(`meta.${k} 缺失`);
});
VALID_PURPOSE.includes(PURPOSE) ? ok(`purpose='${PURPOSE}'`)
  : fail(`purpose='${PURPOSE}' 非法（应为 ${VALID_PURPOSE.join(" | ")}）`);
VALID_RATIO.includes(m.ratio) ? ok(`ratio='${m.ratio}'`)
  : fail(`ratio='${m.ratio}' 非法（应为 ${VALID_RATIO.join(" | ")}）`);
VALID_BG.includes(m.bg) ? ok(`bg='${m.bg}'`)
  : fail(`bg='${m.bg}' 非法（应为 ${VALID_BG.join(" | ")}）`);
VALID_STYLE.includes(m.style) ? ok(`style='${m.style}'`)
  : fail(`style='${m.style}' 非法（六风格之外）`);
if (typeof m.totalDuration === "number" && m.totalDuration > 0) ok(`totalDuration=${m.totalDuration}s`);
else fail(`totalDuration 应为正数，当前 ${m.totalDuration}`);

/* ---------- 2 · purpose 决定数组（规则 1、2） ---------- */
head("2. 支线二选一");
const scenes = Array.isArray(doc.scenes) ? doc.scenes : [];
const points = Array.isArray(doc.points) ? doc.points : [];
if (PURPOSE === "standalone") {
  scenes.length > 0 ? ok(`scenes ${scenes.length} 幕`) : fail("purpose=standalone 但 scenes 为空");
  points.length === 0 ? ok("points 为空（正确）") : fail(`purpose=standalone 却写了 ${points.length} 个 points`);
} else if (PURPOSE === "overlay") {
  points.length > 0 ? ok(`points ${points.length} 个素材点`) : fail("purpose=overlay 但 points 为空");
  scenes.length === 0 ? ok("scenes 为空（正确）") : fail(`purpose=overlay 却写了 ${scenes.length} 个 scenes`);
}

/* ---------- 3 · overlay 形态锁定（规则 3） ---------- */
head("3. overlay 形态锁定");
if (PURPOSE !== "overlay") {
  skip("非 overlay，本项不适用");
} else {
  m.ratio === "3:4" ? ok("ratio=3:4") : fail(`overlay 的 ratio 必须是 3:4，当前 '${m.ratio}'`);
  m.bg === "transparent" ? ok("bg=transparent") : fail(`overlay 的 bg 必须是 transparent，当前 '${m.bg}'`);
}

/* ---------- 4 · scenes 区间（规则 4、7、8） ---------- */
head("4. 幕区间与结构");
if (!scenes.length) {
  skip("无 scenes，本项不适用");
} else {
  const s = [...scenes].sort((a, b) => a.start - b.start);
  const bad = s.filter(x => typeof x.start !== "number" || typeof x.end !== "number" || x.end <= x.start);
  bad.length === 0 ? ok("每幕 end > start") : fail(`${bad.length} 幕区间非法`);

  let gaps = 0, overlaps = 0;
  for (let i = 1; i < s.length; i++) {
    const d = +(s[i].start - s[i - 1].end).toFixed(3);
    if (d < -1e-6) { overlaps++; fail(`第 ${s[i - 1].i} 幕与第 ${s[i].i} 幕重叠 ${Math.abs(d)}s`); }
    else if (d > 1e-6) { gaps++; fail(`第 ${s[i - 1].i} 幕与第 ${s[i].i} 幕之间有 ${d}s 空洞`); }
  }
  if (overlaps === 0 && gaps === 0) ok("幕与幕首尾相接、不重叠、不留洞");

  const roles = new Set(s.map(x => x.role));
  ["open", "body", "close"].every(r => roles.has(r))
    ? ok("role 三类齐全（open / body / close）")
    : fail(`role 缺项：${["open", "body", "close"].filter(r => !roles.has(r)).join(" / ")} 未出现`);

  const last = Math.max(...s.map(x => x.end));
  Math.abs(last - m.totalDuration) < 0.15
    ? ok(`末幕 end=${last}s 对齐 totalDuration`)
    : fail(`末幕 end=${last}s 与 totalDuration=${m.totalDuration}s 不符`);

  /* A-roll 文案长度：≤2 行、每行 ≤12 字 */
  const badTitle = s.filter(x => x.aroll && x.aroll.type === "title" && x.aroll.text)
    .filter(x => x.aroll.text.split("\n").length > 2 || x.aroll.text.split("\n").some(l => l.trim().length > 12));
  badTitle.length === 0 ? ok("A-roll 标题均在 ≤2 行 × ≤12 字内")
    : fail(`${badTitle.length} 幕的标题超长（应为 ≤2 行、每行 ≤12 字）`);

  /* gen-* 必须带 prompt */
  const noPrompt = s.filter(x => x.aroll && /^gen-/.test(x.aroll.type) && !x.aroll.prompt);
  noPrompt.length === 0 ? ok("生成型 A-roll 均带 prompt")
    : fail(`${noPrompt.length} 幕标了 gen-* 却没写 prompt`);
}

/* ---------- 5 · points 区间与元素数（规则 5、6） ---------- */
head("5. 素材点密度");
if (!points.length) {
  skip("无 points，本项不适用");
} else {
  const p = [...points].sort((a, b) => a.start - b.start);
  const bad = p.filter(x => typeof x.start !== "number" || typeof x.end !== "number" || x.end <= x.start);
  bad.length === 0 ? ok("每个素材点 end > start") : fail(`${bad.length} 个素材点区间非法`);

  let ov = 0, tight = 0;
  for (let i = 1; i < p.length; i++) {
    const d = +(p[i].start - p[i - 1].end).toFixed(3);
    if (d < -1e-6) { ov++; fail(`素材点 ${p[i - 1].i} 与 ${p[i].i} 时间重叠`); }
    else if (d < 1.5) { tight++; fail(`素材点 ${p[i - 1].i}→${p[i].i} 空档仅 ${d}s（需 ≥1.5s）`); }
  }
  if (ov === 0) ok("素材点两两不重叠");
  if (ov === 0 && tight === 0) ok(`相邻空档均 ≥1.5s（共 ${p.length - 1} 处）`);

  const short = p.filter(x => (x.end - x.start) < 0.8);
  short.length === 0 ? ok("停留均 ≥0.8s") : fail(`${short.length} 个素材点停留 < 0.8s`);

  const over = p.filter(x => (x.elements || []).length > 3);
  over.length === 0 ? ok("每个素材点元素 ≤3")
    : fail(`${over.length} 个素材点元素超 3 个：${over.map(x => `#${x.i}(${(x.elements || []).length})`).join(" ")}`);
  const empty = p.filter(x => !(x.elements || []).length);
  if (empty.length) fail(`${empty.length} 个素材点没写 elements`);

  const kinds = [...new Set(p.map(x => x.kind))];
  ok(`覆盖 ${kinds.length} 类呼应点：${kinds.join(" / ")}`);

  /* 密度参考：60s 口播 8~12 个呼应点 */
  const per60 = p.length / Math.max(m.totalDuration, 1) * 60;
  if (per60 < 5) note(`每 60s 仅 ${per60.toFixed(1)} 个呼应点 —— 偏稀疏，检查是否有该强调的内容漏了`);
  if (per60 > 14) fail(`每 60s 有 ${per60.toFixed(1)} 个呼应点 —— 太密，叠加层会变成第二块屏`);

  const anims = [...new Set(p.map(x => x.anim).filter(Boolean))];
  anims.length >= 2 ? ok(`用到 ${anims.length} 种入场动效`)
    : note("入场动效种类过少，素材会显得单调");
}

/* ---------- 6 · 双层文本（口播 vs 屏幕字互不重复） ---------- */
head("6. 双层文本");
const vo = Array.isArray(doc.voiceover) ? doc.voiceover : [];
if (!vo.length) {
  skip("无 voiceover，本项不适用");
} else {
  const badVo = vo.filter(x => x.end <= x.start);
  badVo.length === 0 ? ok(`口播 ${vo.length} 句，区间合法`) : fail(`${badVo.length} 句口播区间非法`);
  const longSent = vo.filter(x => x.text && x.text.length > 40);
  longSent.length === 0 ? ok("口播单句 ≤40 字")
    : note(`${longSent.length} 句超过 40 字，读起来会赶`);

  /* 屏幕字不能是口播的逐字复述 */
  const screenTexts = [];
  scenes.forEach(s => { if (s.aroll && s.aroll.text) screenTexts.push(s.aroll.text.replace(/\n/g, "")); });
  points.forEach(p => (p.elements || []).forEach(e => { if (e.t) screenTexts.push(e.t); }));
  let echo = 0;
  for (const v of vo) {
    const t = (v.text || "").replace(/[，。！？、；：\s]/g, "");
    for (const s of screenTexts) {
      const c = s.replace(/[，。！？、；：\s]/g, "");
      if (c.length >= 6 && (t.includes(c) || c.includes(t))) {
        echo++;
        note(`屏幕字「${s}」与口播重复：${v.text}`);
      }
    }
  }
  if (echo === 0) ok("屏幕字与口播无逐字重复");
}

/* ---------- 结论 ---------- */
console.log("\n== 结论 ==");
if (fails === 0) {
  console.log(`  自检通过。（${notes} 条提示）`);
  process.exit(0);
} else {
  console.log(`  ${fails} 项待处理：`);
  process.exit(1);
}
