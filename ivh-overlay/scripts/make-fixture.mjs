#!/usr/bin/env node
/**
 * make-fixture.mjs —— 造一份素材模式的测试产物（good / bad）
 *
 * 用法：node scripts/make-fixture.mjs <输出.html> [good|bad]
 *   good（默认）素材点不重叠、空档 >=1.5s、每组 <=3 元素、不写 data-safe
 *   bad         故意违规：素材点重叠 / 空档不足 / 元素超 3 / 写 data-safe / data-out 倒挂
 *
 * 用途：
 *   · 验证 check-template.mjs 能同时抓对合规与违规（正反双向）
 *   · 验证 shoot.mjs --points 的取样与 check-alpha.mjs 的透明判定
 *   · 作为素材点的写法示例 —— 比读文档快
 *
 * 契约：本脚本产出的产物必须是 PURPOSE=overlay / BASE=timeline /
 *       BG=transparent / RATIO=3:4 / HIDE_HUD=true，否则 check-template.mjs 会 FAIL。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TPL = path.join(HERE, "../assets/template.html");

const OUT = process.argv[2] ? path.resolve(process.argv[2]) : "_fixture.html";
const MODE = (process.argv[3] || "good").toLowerCase();

const GOOD = `  <div class="tl-track">
    <!-- 素材点 1 · 数字/表格数据：纵向流向，2 块 + 1 条关系 = 3 个元素 -->
    <div class="comp" data-in="12.4" data-out="16.8" data-anim="MASK-UP">
      <div class="c-flow">
        <div class="st"><div class="t">一线城市</div><div class="v">40%</div></div>
        <div class="ar"><span class="rl">渠道下沉</span></div>
        <div class="st to"><div class="t">三四线</div><div class="v">70%+</div></div>
      </div>
    </div>
    <!-- 素材点 2 · 关键概念：上下对照，与上一组隔 3.1s 空档 -->
    <div class="comp" data-in="19.9" data-out="23.6" data-anim="MASK-LEFT" data-out-anim="SCALE-OUT">
      <div class="c-cmp">
        <div class="side a"><span class="lb">去年</span><span class="tx">12%</span></div>
        <div class="vs">VS</div>
        <div class="side b"><span class="lb">今年</span><span class="tx">37%</span></div>
      </div>
    </div>
    <!-- 素材点 3 · 数字/表格数据：阶梯堆叠，3 层宽度逐层收窄，与上一组隔 3.5s 空档 -->
    <div class="comp" data-in="27.1" data-out="30.4" data-anim="SCALE-POP" data-out-anim="FADE-OUT">
      <div class="c-stack">
        <div class="ly"><span class="t">三线及以下</span><span class="v">54%</span></div>
        <div class="ly"><span class="t">二线</span><span class="v">31%</span></div>
        <div class="ly"><span class="t">一线</span><span class="v">15%</span></div>
      </div>
    </div>
  </div>`;

const BAD = `  <div class="tl-track">
    <!-- 违规 1：写了 data-safe（素材模式无效）+ 顶层元素 2 个但提示标签超 6 字 -->
    <div class="comp" data-in="3.0" data-out="8.0" data-safe="L" data-anim="MASK-UP">
      <span class="c-capsule">这是一个明显超过六个字的提示标签</span>
      <div class="c-quote">顺带一个引述</div>
    </div>
    <!-- 违规 2：与素材点 1 时间重叠 -->
    <div class="comp" data-in="5.0" data-out="9.0" data-anim="BLUR-IN">
      <div class="c-cmp">
        <div class="side a"><span class="lb">去年</span><span class="tx">12%</span></div>
        <div class="vs">VS</div>
        <div class="side b"><span class="lb">今年</span><span class="tx">37%</span></div>
      </div>
    </div>
    <!-- 违规 3：与上一个只隔 0.8s（需 >=1.5s）+ 顶层元素 4 个（超上限 3） -->
    <div class="comp" data-in="9.8" data-out="12.0" data-anim="POP-IN">
      <div class="c-note">一段很长的信息卡文字，故意写够六十三个字来看看第 11 项能不能把这条硬线抓出来，这一段明显会超过三行十四字的上限。</div>
      <div class="c-stack"><div class="ly"><span class="t">A</span><span class="v">1</span></div></div>
      <div class="c-capsule">多出来的第二块</div>
      <span class="c-kw">多出来的第三块</span>
    </div>
    <!-- 违规 4：data-out 小于 data-in -->
    <div class="comp" data-in="13.8" data-out="13.0" data-anim="GROW">
      <div class="c-kw">倒挂的区间</div>
    </div>
  </div>`;

const POOL = { good: GOOD, bad: BAD };
if (!POOL[MODE]) {
  console.error(`未知模式 ${MODE}（可选 good | bad）`);
  process.exit(1);
}

let h = fs.readFileSync(TPL, "utf8");

/* 锁死成素材模式 —— 与 check-template.mjs 第 5 项的要求一致 */
h = h.replace(/PURPOSE\s*:\s*'[a-z]+'/, "PURPOSE : 'overlay'");
h = h.replace(/BASE\s*:\s*'[a-z]+'/, "BASE    : 'timeline'");
h = h.replace(/BG\s*:\s*'[a-z]+'/, "BG      : 'transparent'");
h = h.replace(/RATIO\s*:\s*'[^']+'/, "RATIO   : '3:4'");
h = h.replace(/ANIMATE\s*:\s*(true|false)/, "ANIMATE : true");
h = h.replace(/HIDE_HUD\s*:\s*(true|false)/, "HIDE_HUD: true");

/* 换掉 body 里的 .tl-track（只动 body 之后的内容，避免误伤注释里的示例） */
const bStart = h.indexOf("<body>");
const trackStart = h.indexOf('<div class="tl-track">', bStart);
if (trackStart < 0) {
  console.error("模板里找不到 .tl-track —— 先确认模板未被改坏");
  process.exit(1);
}
/* 深度配对找 .tl-track 的闭合标签 */
const tagRe = /<(\/?)(div)\b[^>]*?(\/?)>/g;
tagRe.lastIndex = trackStart;
let depth = 0, end = -1, m;
while ((m = tagRe.exec(h))) {
  if (m[3] === "/") continue;
  if (m[1] === "/") { depth--; if (depth === 0) { end = tagRe.lastIndex; break; } }
  else depth++;
}
if (end < 0) {
  console.error(".tl-track 标签未闭合 —— 模板坏了");
  process.exit(1);
}
h = h.slice(0, trackStart) + POOL[MODE] + h.slice(end);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, h, "utf8");

/* 统计时剥掉注释，避免把注释里的示例算进来 */
const bare = h.replace(/<!--[\s\S]*?-->/g, "");
const cnt = re => (bare.match(re) || []).length;
console.log(`已生成 ${OUT}（${MODE} · 素材模式 3:4）`);
console.log(`  素材点 ${cnt(/<div class="comp"/g)} 个 · tl-track ${cnt(/class="tl-track"/g)} 个（应 1）· section ${cnt(/<section/g)} 个（应 0）`);
console.log(`  div ${cnt(/<div(?=[\s>])/g)}/${cnt(/<\/div>/g)}  head ${cnt(/<head[\s>]/g)}/${cnt(/<\/head>/g)}`);
