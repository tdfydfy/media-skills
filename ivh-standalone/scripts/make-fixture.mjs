#!/usr/bin/env node
/**
 * make-fixture.mjs —— 造一份独立成片的测试产物
 *
 * 用法：node scripts/make-fixture.mjs <输出.html> [mode]
 *   scene-good     分幕模式，合规（默认）
 *   scene-bad      分幕模式，故意违规（1 幕缺 data-sec + 提示标签超 6 字）
 *   timeline-good  时间轴模式，A/B roll 合规
 *   timeline-bad   时间轴模式，故意违规（区间倒挂 + 停留过短）
 *
 * 用途：
 *   · 验证 check-template.mjs 能同时抓对合规与违规（正反双向）
 *   · 验证 shoot.mjs 的逐幕截图（#<幕号>）与抽帧合成
 *   · 作为独立成片的写法示例 —— 比读文档快
 *
 * 契约：本脚本产出的产物必须是 PURPOSE=standalone，否则 check-template.mjs 会提示走错技能。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TPL = path.join(HERE, "../assets/template.html");

const OUT = process.argv[2] ? path.resolve(process.argv[2]) : "_fixture.html";
const MODE = (process.argv[3] || "scene-good").toLowerCase();

/* ---------- 分幕（BASE=text）---------- */
const SCENE_GOOD = `
  <section class="scene active" data-sec="6">
    <div class="kicker anim">2026 · 市场观察</div>
    <div class="h1 anim">渠道下沉<br>带来<span class="hl">结构性</span>增长</div>
    <div class="body anim">华东区同比增速跑赢大盘，增量主要来自三线及以下城市。</div>
  </section>
  <section class="scene" data-sec="6">
    <div class="c-data anim">
      <div class="v"><span class="num" data-to="37" data-prefix="+" data-suffix="%" data-dur="1">+0%</span></div>
      <div class="k">同比增速 · 华东区</div>
    </div>
    <div class="c-capsule anim">渠道下沉</div>
  </section>
  <section class="scene" data-sec="7">
    <div class="h2 anim">三线城市<span class="hl2">贡献过半</span></div>
    <div class="c-bar anim">
      <div class="row">
        <div class="lb"><span>三线及以下</span><b>54%</b></div>
        <div class="track"><div class="fill" style="width:54%"></div></div>
      </div>
      <div class="row">
        <div class="lb"><span>二线</span><b>31%</b></div>
        <div class="track"><div class="fill" style="width:31%;background:var(--c2)"></div></div>
      </div>
      <div class="row">
        <div class="lb"><span>一线</span><b>15%</b></div>
        <div class="track"><div class="fill" style="width:15%;background:var(--c3)"></div></div>
      </div>
    </div>
  </section>`;

/* 违规：第 1 幕缺 data-sec，第 2 幕提示标签超 6 字 */
const SCENE_BAD = `
  <section class="scene active">
    <div class="h1 anim">这一幕没有 data-sec</div>
  </section>
  <section class="scene" data-sec="6">
    <div class="c-data anim">
      <div class="v"><span class="num" data-to="37" data-prefix="+" data-suffix="%">+0%</span></div>
      <div class="k">同比增速 · 华东区</div>
    </div>
    <div class="c-capsule anim">这是一个明显超过六个字的提示标签</div>
  </section>`;

/* ---------- 时间轴（BASE=timeline）· A/B roll ---------- */
const TL_GOOD = `
  <div class="tl-track">
    <div class="comp" data-in="0.4" data-out="5.2" data-roll="A" data-anim="MASK-UP">
      <div class="kicker">2026 · 市场观察</div>
      <div class="h1">渠道下沉<br>带来<span class="hl">结构性</span>增长</div>
    </div>
    <div class="comp" data-in="5.6" data-out="13.4" data-roll="A" data-anim="MASK-LEFT">
      <div class="h2">三线城市<span class="hl2">贡献过半</span></div>
    </div>
    <div class="comp" data-in="6.2" data-out="13.4" data-roll="B" data-anim="MASK-UP">
      <div class="c-bar">
        <div class="row">
          <div class="lb"><span>三线及以下</span><b>54%</b></div>
          <div class="track"><div class="fill" style="width:54%"></div></div>
        </div>
        <div class="row">
          <div class="lb"><span>二线</span><b>31%</b></div>
          <div class="track"><div class="fill" style="width:31%;background:var(--c2)"></div></div>
        </div>
        <div class="row">
          <div class="lb"><span>一线</span><b>15%</b></div>
          <div class="track"><div class="fill" style="width:15%;background:var(--c3)"></div></div>
        </div>
      </div>
    </div>
    <div class="comp" data-in="13.8" data-out="18.6" data-roll="A" data-anim="SCALE-POP" data-out-anim="FADE-OUT">
      <div class="c-quote">增量不是抢来的，是长出来的。</div>
    </div>
  </div>`;

/* 违规：第 2 个组件区间倒挂 + 停留过短 */
const TL_BAD = `
  <div class="tl-track">
    <div class="comp" data-in="0.4" data-out="5.2" data-roll="A" data-anim="MASK-UP">
      <div class="h1">正常的一幕</div>
    </div>
    <div class="comp" data-in="6.0" data-out="4.0" data-roll="B" data-anim="BLUR-IN">
      <div class="c-data"><div class="v"><span class="num" data-to="37">+0%</span></div><div class="k">区间倒挂</div></div>
    </div>
    <div class="comp" data-in="7.0" data-out="7.3" data-roll="A" data-anim="FADE-IN">
      <div class="c-quote">停留只有 0.3s</div>
    </div>
  </div>`;

const POOL = {
  "scene-good":    { base: "text",     body: SCENE_GOOD },
  "scene-bad":     { base: "text",     body: SCENE_BAD },
  "timeline-good": { base: "timeline", body: TL_GOOD },
  "timeline-bad":  { base: "timeline", body: TL_BAD },
};
if (!POOL[MODE]) {
  console.error(`未知模式 ${MODE}（可选 ${Object.keys(POOL).join(" | ")}）`);
  process.exit(1);
}
const { base, body } = POOL[MODE];

let h = fs.readFileSync(TPL, "utf8");
h = h.replace(/PURPOSE\s*:\s*'[a-z]+'/, "PURPOSE : 'standalone'");
h = h.replace(/BASE\s*:\s*'[a-z]+'/, `BASE    : '${base}'`);
h = h.replace(/ANIMATE\s*:\s*(true|false)/, "ANIMATE : true");
if (base === "text") h = h.replace(/AUTOPLAY\s*:\s*(true|false)/, "AUTOPLAY: true");

/* 换掉 #stage 的内容（深度配对找闭合），避免误伤注释里的示例 */
const bStart = h.indexOf("<body>");
const stageIdx = h.indexOf('<div id="stage"', bStart);
const stageOpenEnd = h.indexOf(">", stageIdx) + 1;
const tagRe = /<(\/?)(div)\b[^>]*?(\/?)>/g;
tagRe.lastIndex = stageOpenEnd;
let depth = 1, end = -1, m;
while ((m = tagRe.exec(h))) {
  if (m[3] === "/") continue;
  if (m[1] === "/") { depth--; if (depth === 0) { end = m.index; break; } }
  else depth++;
}
if (end < 0) {
  console.error("#stage 未闭合 —— 模板坏了");
  process.exit(1);
}
h = h.slice(0, stageOpenEnd) + "\n" + body + "\n" + h.slice(end);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, h, "utf8");

const bare = h.replace(/<!--[\s\S]*?-->/g, "");
const cnt = re => (bare.match(re) || []).length;
console.log(`已生成 ${OUT}（${MODE} · 独立成片 / BASE=${base}）`);
console.log(`  section ${cnt(/<section[^>]*class="scene/g)} 个 · comp ${cnt(/<div class="comp"/g)} 个 · tl-track ${cnt(/class="tl-track"/g)} 个`);
console.log(`  div ${cnt(/<div(?=[\s>])/g)}/${cnt(/<\/div>/g)}  head ${cnt(/<head[\s>]/g)}/${cnt(/<\/head>/g)}`);
