#!/usr/bin/env node
/**
 * selftest-check.mjs —— 自测 check-template.mjs（本技能只做独立成片）
 *
 * 用模板造出「合规」与「故意违规」的独立成片产物，验证第 9 / 10 / 11 项
 * 正反两向都工作。这是维护用脚本，与交付无关。
 *
 * 独立成片的两条排版路径：
 *   BASE='text'       幕轮播  → 第 9 项 skip，第 10 项查幕结构
 *   BASE='timeline'   组件卡点 → 第 9 项查时间轴，第 10 项只查组件多样性
 *
 * 用法：node scripts/selftest-check.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL = path.resolve(HERE, "..");
const TPL = path.join(SKILL, "assets/template.html");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ivh-sa-selftest-"));

const tpl = fs.readFileSync(TPL, "utf8");

/* 独立成片：PURPOSE 恒为 standalone。按需切换 BASE 并注入内容。 */
function build({ base, comps, sceneSecBreak }) {
  let h = tpl;
  h = h.replace(/PURPOSE\s*:\s*'[a-z]+'/, "PURPOSE : 'standalone'");
  h = h.replace(/BASE\s*:\s*'[a-z]+'/, `BASE    : '${base}'`);
  h = h.replace(/ANIMATE\s*:\s*(true|false)/, "ANIMATE : true");

  const bStart = h.indexOf("<body>");
  const stageIdx = h.indexOf('<div id="stage"', bStart);
  const stageOpenEnd = h.indexOf(">", stageIdx) + 1;

  /* 深度配对找 #stage 的闭合标签 */
  const tagRe = /<(\/?)(div)\b[^>]*?(\/?)>/g;
  tagRe.lastIndex = stageOpenEnd;
  let depth = 1, end = -1, m;
  while ((m = tagRe.exec(h))) {
    if (m[3] === "/") continue;
    if (m[1] === "/") { depth--; if (depth === 0) { end = m.index; break; } }
    else depth++;
  }
  const stageAttrs = h.slice(stageIdx, stageOpenEnd);

  let inner;
  if (base === "timeline") {
    inner = comps;
  } else {
    /* text：保留场景，可故意破坏 data-sec 以触发第 10 项 */
    inner = h.slice(stageOpenEnd, end);
    if (sceneSecBreak) inner = inner.replace(/(<section[^>]*\bscene\b[^>]*?)\s+data-sec="\d+"/, "$1");
  }

  return h.slice(0, stageIdx) + stageAttrs + inner + h.slice(end);
}

/* 合规时间轴：数据卡 + 对比卡 + 引述，错峰入场，组件多样 */
const GOOD_COMPS = `
  <div class="tl-track">
    <div class="comp" data-in="2.0" data-out="5.4" data-anim="MASK-UP">
      <div class="c-data"><div class="v"><span class="num" data-to="37" data-prefix="+" data-suffix="%" data-dur="1">+0%</span></div><div class="k">同比增速 · 华东区</div></div>
    </div>
    <div class="comp" data-in="5.8" data-out="9.6" data-anim="MASK-LEFT">
      <div class="c-vs"><span class="side">不是技术问题</span><span class="mid">≠</span><span class="side">是组织问题</span></div>
    </div>
    <div class="comp" data-in="10.0" data-out="13.8" data-anim="SCALE-POP" data-out-anim="FADE-OUT">
      <div class="c-quote">增量不是抢来的，是长出来的。</div>
    </div>
  </div>`;

/* 违规时间轴：第 2 个组件区间倒挂 */
const BAD_COMPS = `
  <div class="tl-track">
    <div class="comp" data-in="2.0" data-out="5.4" data-anim="MASK-UP">
      <div class="c-data"><div class="v"><span class="num" data-to="37">+0%</span></div><div class="k">同比增速</div></div>
    </div>
    <div class="comp" data-in="9.0" data-out="6.0" data-anim="BLUR-IN">
      <div class="c-quote">data-out 小于 data-in</div>
    </div>
  </div>`;

const cases = [
  { tag: "text-good",     html: build({ base: "text" }),                        expect: 0 },
  { tag: "text-bad",      html: build({ base: "text", sceneSecBreak: true }),   expect: 1 },
  { tag: "timeline-good", html: build({ base: "timeline", comps: GOOD_COMPS }), expect: 0 },
  { tag: "timeline-bad",  html: build({ base: "timeline", comps: BAD_COMPS }),  expect: 1 },
];
for (const c of cases) fs.writeFileSync(path.join(TMP, c.tag + ".html"), c.html, "utf8");

const CHECK = path.join(SKILL, "scripts/check-template.mjs");
const run = f => {
  try {
    const out = execFileSync(process.execPath, [CHECK, f], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
};

let pass = 0, failN = 0;
const t = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failN++; console.log(`  FAIL  ${name}${detail ? "  → " + detail : ""}`); }
};
const echo = (out, rx) => out.split("\n").filter(l => rx.test(l)).forEach(l => console.log("    " + l.trim()));

/* ---------- 分幕（BASE=text）---------- */
console.log("== 分幕 · 正向：合规 fixture 应当通过 ==");
{
  const r = run(path.join(TMP, "text-good.html"));
  echo(r.out, /FAIL|幕|组件|结论|自检|停留/);
  t("exit=0", r.code === 0, "exit=" + r.code);
  t("检测到 3 幕", /检测到 3 幕/.test(r.out));
  t("第 9 项 skip", /9\. 时间轴完整性[\s\S]*?skip/.test(r.out));
  t("第 10 项查幕结构", /检测到 \d+ 幕/.test(r.out));
  t("无 FAIL", !/FAIL/.test(r.out));
}

console.log("\n== 分幕 · 反向：幕缺 data-sec 应当被抓 ==");
{
  const r = run(path.join(TMP, "text-bad.html"));
  echo(r.out, /FAIL|幕|结论|待处理|   -/);
  t("exit=1", r.code === 1, "exit=" + r.code);
  t("抓到幕缺 data-sec", /缺少 data-sec/.test(r.out));
}

/* ---------- 时间轴（BASE=timeline）---------- */
console.log("\n== 时间轴 · 正向：合规 fixture 应当通过 ==");
{
  const r = run(path.join(TMP, "timeline-good.html"));
  echo(r.out, /FAIL|组件|动效|停留|共存|结论|自检/);
  t("exit=0", r.code === 0, "exit=" + r.code);
  t("第 9 项启用（检测到组件）", /检测到组件 3 个/.test(r.out));
  t("同场共存判定", /同场共存/.test(r.out));
  t("无 FAIL", !/FAIL/.test(r.out));
}

console.log("\n== 时间轴 · 反向：区间倒挂应当被抓 ==");
{
  const r = run(path.join(TMP, "timeline-bad.html"));
  echo(r.out, /FAIL|组件|结论|待处理|   -/);
  t("exit=1", r.code === 1, "exit=" + r.code);
  t("抓到 data-out 小于 data-in", /不大于 data-in/.test(r.out));
}

console.log(`\n== 结果：${pass} 通过 / ${failN} 失败 ==`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failN === 0 ? 0 : 1);
