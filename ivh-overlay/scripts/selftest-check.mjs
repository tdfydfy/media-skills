#!/usr/bin/env node
/**
 * selftest-check.mjs —— 自测 check-template.mjs（本技能只跑素材模式）
 *
 * 用模板造出「合规」与「故意违规」的素材产物，验证第 5 / 9 / 10 / 11 项
 * 正反两向都工作。这是维护用脚本，与交付无关。
 *
 * 素材模式的判据（与整屏叠加完全不同，所以这里只测这一套）：
 *   · CONFIG 四项锁死：PURPOSE=overlay / BASE=timeline / BG=transparent / RATIO=3:4
 *   · 素材点之间不得时间重叠 —— 同一时刻只有一组元素
 *   · 相邻素材点留 >=1.5s 纯透明空档
 *   · 一个素材点 <=3 个元素（一组元素 + 它们的关系）
 *   · 不写 data-safe（板由用户自己摆，没有"中央"要避）
 *   · 提示标签 <=6 字、信息卡 <=14 字/行
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ivh-ov-selftest-"));

const tpl = fs.readFileSync(TPL, "utf8");

/* 把模板改造成素材模式，并按需注入素材点。
   ratioOverride 用来验证「比例锁」——模板只允许 3:4，别的比例必须被 FAIL。 */
function build(compsHtml, ratioOverride) {
  let h = tpl;
  h = h.replace(/PURPOSE\s*:\s*'[a-z]+'/, "PURPOSE : 'overlay'");
  h = h.replace(/BASE\s*:\s*'[a-z]+'/, "BASE    : 'timeline'");
  h = h.replace(/BG\s*:\s*'[a-z]+'/, "BG      : 'transparent'");
  if (ratioOverride) h = h.replace(/RATIO\s*:\s*'[^']+'/, `RATIO   : '${ratioOverride}'`);
  h = h.replace(/ANIMATE\s*:\s*(true|false)/, "ANIMATE : true");
  h = h.replace(/HIDE_HUD\s*:\s*(true|false)/, "HIDE_HUD: true");

  /* 换掉 body 里的 .tl-track（只动 body 之后，避免误伤注释里的示例）。
     深度配对找闭合，与 make-fixture.mjs 同一套做法。 */
  const bStart = h.indexOf("<body>");
  const trackStart = h.indexOf('<div class="tl-track">', bStart);
  const tagRe = /<(\/?)(div)\b[^>]*?(\/?)>/g;
  tagRe.lastIndex = trackStart;
  let depth = 0, end = -1, m;
  while ((m = tagRe.exec(h))) {
    if (m[3] === "/") continue;
    if (m[1] === "/") { depth--; if (depth === 0) { end = tagRe.lastIndex; break; } }
    else depth++;
  }
  h = h.slice(0, trackStart) + compsHtml + h.slice(end);
  return h;
}

/* ---------- 合规素材：3 组，组内 <=3 元素，组间 >=1.5s 空档 ---------- */
const GOOD = `
  <div class="tl-track">
    <div class="comp" data-in="12.4" data-out="16.8" data-anim="MASK-UP">
      <div class="c-flow">
        <div class="st"><div class="t">一线城市</div><div class="v">40%</div></div>
        <div class="ar"><span class="rl">渠道下沉</span></div>
        <div class="st to"><div class="t">三四线</div><div class="v">70%+</div></div>
      </div>
    </div>
    <div class="comp" data-in="19.9" data-out="23.6" data-anim="MASK-LEFT" data-out-anim="SCALE-OUT">
      <div class="c-cmp">
        <div class="side a"><span class="lb">去年</span><span class="tx">12%</span></div>
        <div class="vs">VS</div>
        <div class="side b"><span class="lb">今年</span><span class="tx">37%</span></div>
      </div>
    </div>
    <div class="comp" data-in="27.1" data-out="30.4" data-anim="SCALE-POP" data-out-anim="FADE-OUT">
      <div class="c-stack">
        <div class="ly"><span class="t">三线及以下</span><span class="v">54%</span></div>
        <div class="ly"><span class="t">二线</span><span class="v">31%</span></div>
        <div class="ly"><span class="t">一线</span><span class="v">15%</span></div>
      </div>
    </div>
  </div>`;

/* ---------- 违规素材：重叠 + 空档不足 + data-safe + 元素超 3 + 标签超 6 字 + 区间倒挂 ---------- */
const BAD = `
  <div class="tl-track">
    <div class="comp" data-in="3.0" data-out="8.0" data-safe="L" data-anim="MASK-UP">
      <span class="c-capsule">这是一个明显超过六个字的提示标签</span>
      <div class="c-stack">
        <div class="ly"><span class="t">一线</span><span class="v">15%</span></div>
        <div class="ly"><span class="t">二线</span><span class="v">31%</span></div>
        <div class="ly"><span class="t">三线</span><span class="v">54%</span></div>
        <div class="ly"><span class="t">其他</span><span class="v">0%</span></div>
      </div>
    </div>
    <div class="comp" data-in="5.0" data-out="9.0" data-anim="BLUR-IN">
      <div class="c-cmp">
        <div class="side a"><span class="lb">去年</span><span class="tx">12%</span></div>
        <div class="vs">VS</div>
        <div class="side b"><span class="lb">今年</span><span class="tx">37%</span></div>
      </div>
    </div>
    <div class="comp" data-in="9.8" data-out="12.0" data-anim="POP-IN">
      <div class="c-note">与上一个素材点之间只隔了 0.8s</div>
    </div>
    <div class="comp" data-in="13.8" data-out="13.0" data-anim="GROW">
      <div class="c-kw">倒挂的区间</div>
    </div>
  </div>`;

const cases = [
  { tag: "good",        html: build(GOOD),            expect: 0 },
  { tag: "bad",         html: build(BAD),             expect: 1 },
  { tag: "ratio-broken", html: build(GOOD, "16:9"),   expect: 1 },
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

/* ---------- 正向 ---------- */
console.log("== 素材模式 · 正向：合规 fixture 应当通过 ==");
{
  const r = run(path.join(TMP, "good.html"));
  echo(r.out, /FAIL|形态 |素材点|空档|重叠|结论|自检|提示标签|信息卡|元素|动效/);
  t("exit=0", r.code === 0, "exit=" + r.code);
  t("判定为素材模式", /素材模式/.test(r.out));
  t("无 FAIL", !/FAIL/.test(r.out));
  t("空档检查通过", /相邻素材点空档均 >=1\.5s/.test(r.out));
  t("元素数检查通过", /每组元素均 <=3/.test(r.out));
  t("第 10 项查素材点规模", /素材点规模/.test(r.out));
}

/* ---------- 反向 ---------- */
console.log("\n== 素材模式 · 反向：违规 fixture 应当被抓 ==");
{
  const r = run(path.join(TMP, "bad.html"));
  echo(r.out, /FAIL|形态 |素材点|空档|元素|结论|待处理|   -/);
  t("exit=1", r.code === 1, "exit=" + r.code);
  t("抓到素材点时间重叠", /素材点时间重叠/.test(r.out));
  t("抓到空档不足 1.5s", /空档只有 0\.8s/.test(r.out));
  t("抓到元素超 3 个", /素材点元素超 3 个/.test(r.out));
  t("提示 data-safe 无效", /写了 data-safe/.test(r.out));
  t("抓到提示标签超 6 字", /提示标签超 6 字/.test(r.out));
  t("抓到 data-out 小于 data-in", /不大于 data-in/.test(r.out));
}

/* ---------- 比例锁 ---------- */
console.log("\n== 比例锁 · 非 3:4 必须被 FAIL ==");
{
  const r = run(path.join(TMP, "ratio-broken.html"));
  echo(r.out, /FAIL|RATIO/);
  t("exit=1", r.code === 1, "exit=" + r.code);
  t("抓到 RATIO 非法", /透明素材必须为 '3:4'/.test(r.out));
}

console.log(`\n== 结果：${pass} 通过 / ${failN} 失败 ==`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failN === 0 ? 0 : 1);
