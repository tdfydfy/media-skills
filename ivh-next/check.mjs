/**
 * check.mjs —— 校验脚本 JSON
 *
 *   node ivh-next/check.mjs 脚本.json
 *
 * 只查机器能判的：
 *   · 契约     meta / voiceover / points 的字段与取值
 *   · 时间     停留 >=3s、相邻空档 >=1.5s、点不重叠、落在音轨范围内
 *   · 密度     按 contentType 分档
 *   · 对齐     extract.md 的 kind 清单 == 该风格 spec.md 的 kind 列
 *   · 形状     blocks 的元素个数与 spec.md 声明的形状一致
 *   · 样板间   spec.md 里每个 kind，template.html 里必须有同名锚点（反之亦然）
 *   · 产物     给了 HTML 时：逐点核对 kind / data-in / data-out，动效名不许自创
 *
 * 不查：好不好看。那是用户看 HTML 时的事。
 *
 * 退出码：0 = 全过，1 = 有 FAIL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const MIN_HOLD = 3.0;      /* 一个点停留的下限（秒） */
const MIN_GAP  = 1.5;      /* 相邻两点之间的纯透明空档下限（秒） */

const DENSITY = {
  data:      [8, 12, "研报 / 口播 / 复盘"],
  narrative: [4, 7,  "故事 / 案例 / 科普"],
  drama:     [3, 5,  "剧情 / 短剧"],
  opinion:   [5, 8,  "观点 / 评论"],
};

let fails = 0, warns = 0;
const ok   = m => console.log("  \u2713 " + m);
const fail = m => { fails++; console.log("  \u2717 " + m); };
const warn = m => { warns++; console.log("  ! " + m); };
const head = m => console.log("\n" + m);

/* ---------- 小工具 ---------- */

const strip = s => s.replace(/`/g, "").trim();

/** 取一段（## 标题到下一个标题）里的表格行，返回 cell 数组的数组 */
function tableIn(lines, fromRe, toRe) {
  const a = lines.findIndex(l => fromRe.test(l));
  if (a < 0) return [];
  let b = lines.length;
  for (let i = a + 1; i < lines.length; i++) if (toRe.test(lines[i])) { b = i; break; }
  const rows = [];
  for (let i = a + 1; i < b; i++) {
    const l = lines[i].trim();
    if (!l.startsWith("|")) continue;
    const cells = l.replace(/^\|/, "").replace(/\|$/, "").split("|").map(s => s.trim());
    if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue;   /* 分隔行 */
    rows.push(cells);
  }
  if (rows.length) rows.shift();   /* 丢掉表头 */
  return rows;
}

/** `[{ a, b }, { c }]` -> { n: 2 } ; `[{ a }] × 2~4` -> { n: 1, min: 2, max: 4 } */
function shapeOf(cell) {
  const m = cell.match(/\[(.*?)\]\s*(?:×\s*(\d+)\s*~\s*(\d+))?/);
  if (!m) return null;
  const inner = m[1];
  let depth = 0, n = 0;
  for (const ch of inner) {
    if (ch === "{") { if (depth === 0) n++; depth++; }
    else if (ch === "}") depth--;
  }
  const out = { n };
  if (m[2]) { out.min = +m[2]; out.max = +m[3]; }
  return out;
}

/* ---------- 读两个共享文件 ---------- */

const extractPath = path.join(HERE, "extract.md");
if (!fs.existsSync(extractPath)) { console.log("找不到 extract.md"); process.exit(1); }
const extractKinds = tableIn(fs.readFileSync(extractPath, "utf8").split(/\r?\n/),
  /^##\s*四/, /^#{2,3}\s/).map(r => strip(r[1])).filter(Boolean);

/* ---------- 读脚本 ---------- */

const scriptFile = process.argv[2];
if (!scriptFile) { console.log("用法：node ivh-next/check.mjs 脚本.json [产物.html]"); process.exit(1); }
if (!fs.existsSync(scriptFile)) { console.log("找不到 " + scriptFile); process.exit(1); }

let doc;
try { doc = JSON.parse(fs.readFileSync(scriptFile, "utf8")); }
catch (e) { console.log("JSON 解析失败：" + e.message); process.exit(1); }

const meta = doc.meta || {};
const vo   = Array.isArray(doc.voiceover) ? doc.voiceover : [];
const pts  = Array.isArray(doc.points) ? doc.points : [];

/* ---------- 1 · 契约：meta ---------- */

head("1. meta");
const styleDir = path.join(HERE, "styles", String(meta.style || ""));
const specPath  = path.join(styleDir, "spec.md");
const tplPath   = path.join(styleDir, "template.html");

if (!meta.style) fail("meta.style 缺失 —— 它决定查哪份 spec.md");
else if (!fs.existsSync(specPath)) fail("找不到风格 " + meta.style + " 的 spec.md（" + specPath + "）");
else ok("风格 " + meta.style);

meta.ratio === "3:4" ? ok("ratio = 3:4") : fail("ratio 必须是 3:4，现在是 " + JSON.stringify(meta.ratio));
DENSITY[meta.contentType] ? ok("contentType = " + meta.contentType)
                          : fail("contentType 必须是 data / narrative / drama / opinion 之一");
typeof meta.duration === "number" && meta.duration > 0 ? ok("duration = " + meta.duration + "s")
                                                       : fail("duration 必须是正数秒");
meta.title ? ok("title 有") : warn("meta.title 为空 —— 交付时不好认");

/* ---------- 2 · 读 spec，建 kind 表 ---------- */

let specKinds = [], specShape = {}, specCap = {};
if (fs.existsSync(specPath)) {
  const L = fs.readFileSync(specPath, "utf8").split(/\r?\n/);
  for (const r of tableIn(L, /^##\s*五/, /^#{2,3}\s/)) {
    if (r.length < 5) continue;
    const k = strip(r[0]);
    if (!k) continue;
    specKinds.push(k);
    specShape[k] = shapeOf(strip(r[3]));
    specCap[k] = strip(r[4]);
  }
}

/* ---------- 3 · 对齐：extract.md ↔ spec.md ---------- */

head("3. 对齐（extract.md \u2194 spec.md）");
if (!specKinds.length) {
  fail("spec.md 里没解析到 kind 表 —— 检查「## 五」那一节是否还是五列表格");
} else {
  const onlyExtract = extractKinds.filter(k => !specKinds.includes(k));
  const onlySpec    = specKinds.filter(k => !extractKinds.includes(k));
  onlyExtract.length === 0 ? ok("extract.md 的 " + extractKinds.length + " 个 kind 本风格全部支持")
                           : fail("extract.md 有、本风格没有：" + onlyExtract.join(" / ")
                               + " —— 要么在 spec.md 补上，要么写明「不支持，降级成 X」");
  onlySpec.length === 0 ? ok("spec.md 没有多出来的 kind")
                        : warn("spec.md 有、extract.md 没教怎么认出来：" + onlySpec.join(" / "));
}

/* ---------- 4 · 样板间：spec.md ↔ template.html ---------- */

head("4. 样板间（spec.md \u2194 template.html）");
if (!fs.existsSync(tplPath)) {
  fail("找不到 template.html");
} else {
  const tpl = fs.readFileSync(tplPath, "utf8");
  const anchors = [...tpl.matchAll(/<!--\s*kind:\s*([^|>]*?)\s*(?:\|[^>]*?)?\s*-->/g)].map(m => m[1].trim());
  const missing = specKinds.filter(k => !anchors.includes(k));
  const extra   = [...new Set(anchors)].filter(a => !specKinds.includes(a));
  missing.length === 0 ? ok("spec.md 的 " + specKinds.length + " 个 kind 在样板间里都有例子")
                       : fail("样板间缺这些 kind：" + missing.join(" / "));
  extra.length === 0 ? ok("样板间没有多余的锚点") : warn("样板间有、spec.md 没归属：" + extra.join(" / "));
  /IVH\s*=|window\.IVH/.test(tpl) ? ok("产物暴露 IVH.seekAt（渲染器要它才能定格）")
                                  : fail("template.html 没有暴露 window.IVH —— 渲染环节会抽不了帧");
}

/* ---------- 5 · 时间 ---------- */

head("5. 时间");
const END = typeof meta.duration === "number" ? meta.duration : Infinity;
const sorted = pts.slice().sort((a, b) => a.start - b.start);

sorted.forEach((p, i) => {
  const at = "points[" + i + "].i=" + p.i;
  if (!(p.end > p.start)) fail(at + " 区间非法（end <= start）");
  const hold = p.end - p.start;
  if (hold < MIN_HOLD) fail(at + " 停留 " + hold.toFixed(2) + "s < " + MIN_HOLD + "s");
  if (p.start < 0 || p.end > END) fail(at + " 超出音轨范围（0~" + END + "s）");
});

for (let i = 1; i < sorted.length; i++) {
  const gap = sorted[i].start - sorted[i - 1].end;
  const at = "points[" + i + "] 与上一点";
  if (gap < 0) fail(at + " 重叠了 " + Math.abs(gap).toFixed(2) + "s");
  else if (gap < MIN_GAP) fail(at + " 空档只有 " + gap.toFixed(2) + "s < " + MIN_GAP + "s（实拍主体露不出来）");
}
if (!fails) ok("停留与空档都在线内");

/* ---------- 6 · 内容形状 ---------- */

head("6. 内容形状");
{
  const bad = [];
  sorted.forEach((p, i) => {
    const at = "points[" + i + "].kind=" + p.kind;
    if (!specKinds.includes(p.kind)) { bad.push(at + " 不在本风格清单里"); return; }
    const s = specShape[p.kind], blocks = Array.isArray(p.blocks) ? p.blocks : null;
    if (!blocks) { bad.push(at + " 缺 blocks"); return; }
    blocks.forEach(function(b, bi){
      Object.keys(b).forEach(function(k){
        var v = b[k];
        if (v === "" || v === null || v === undefined) bad.push(at + " blocks[" + bi + "]." + k + " 是空的");
      });
    });
    if (s) {
      const n = blocks.length;
      if (s.min !== undefined) {
        if (n < s.min || n > s.max) bad.push(at + " blocks 有 " + n + " 项，应为 " + s.min + "~" + s.max + " 项");
      } else if (n !== s.n) {
        bad.push(at + " blocks 有 " + n + " 项，应为 " + s.n + " 项");
      }
    }
  });
  bad.length ? bad.forEach(fail) : ok(sorted.length + " 个点的 kind 与元素个数都对");
}

/* ---------- 7 · 密度 ---------- */

head("7. 密度");
{
  const band = DENSITY[meta.contentType];
  if (!band || !sorted.length) {
    console.log("  · 跳过");
  } else {
    const [lo, hi, label] = band;
    const per60 = sorted.length / Math.max(meta.duration, 1) * 60;
    const txt = lo + "~" + hi + " 个/60s（" + meta.contentType + " · " + label + "）";
    if (per60 < lo * 0.6) warn("每 60s 只有 " + per60.toFixed(1) + " 个 —— 低于 " + txt + "，检查有没有该强调的漏了");
    else if (per60 > hi * 1.2) fail("每 60s 有 " + per60.toFixed(1) + " 个 —— 超出 " + txt + "，叠加层会变成第二块屏");
    else ok("密度 " + per60.toFixed(1) + " 个/60s，落在 " + txt + " 内");
  }
}

/* ---------- 8 · 音轨 ---------- */

head("8. 音轨");
{
  const bad = vo.filter(x => !(x.end > x.start));
  bad.length ? fail(bad.length + " 句 voiceover 区间非法") : ok("voiceover " + vo.length + " 句，区间合法");
  if (vo.length && sorted.length) {
    const miss = sorted.filter(p => !vo.some(x => x.end <= p.start && p.start - x.end < 3.0));
    miss.length === 0 ? ok("每个点都贴着一句口播（入点后 3s 内）")
                      : warn(miss.length + " 个点找不到贴着的句子（points[" +
                          sorted.map((p, i) => (vo.some(x => x.end <= p.start && p.start - x.end < 3.0) ? -1 : i))
                               .filter(i => i >= 0).join(", ") + "]）");
  }
}

/* ---------- 9 · 产物（给了 HTML 才跑） ---------- */

head("9. 产物");
const htmlFile = process.argv[3];
if (!htmlFile) {
  console.log("  · 跳过（用法：node ivh-next/check.mjs 脚本.json 产物.html）");
} else if (!fs.existsSync(htmlFile)) {
  fail("找不到 " + htmlFile);
} else if (!fs.existsSync(tplPath)) {
  console.log("  · 跳过（没有 template.html 可对）");
} else {
  const html = fs.readFileSync(htmlFile, "utf8");
  const tpl  = fs.readFileSync(tplPath, "utf8");

  /* 只取产物区：#track 到样板间之间 */
  const t0 = html.indexOf('id="track"');
  const t1 = html.indexOf('<template id="kit">', t0);   /* 从 #track 之后找，文件头注释里也提到过 kit */
  const track = (t0 >= 0 && t1 > t0) ? html.slice(t0, t1) : "";

  if (!track) {
    fail("产物里找不到 #track 区（被删了？样板间提到前面了？）");
  } else {
    /* 按 kind 锚点切块 —— 锚点是 ② 抄块时必须带过来的东西 */
    const re = /<!--\s*kind:\s*([^|>]*?)\s*(?:\|[^>]*?)?\s*-->/g;
    const anchors = [...track.matchAll(re)];
    const blocks = anchors.map((m, i) => {
      const chunk = track.slice(m.index, i + 1 < anchors.length ? anchors[i + 1].index : track.length);
      const g = name => (chunk.match(new RegExp(name + '="([^"]*)"')) || [])[1];
      const pm = chunk.match(/class="comp (raise|sunk|bare)/);
      return {
        kind: m[1].trim(),
        inT: parseFloat(g("data-in")),
        outT: parseFloat(g("data-out")),
        anim: g("data-anim"),
        phase: pm ? pm[1] : null,
      };
    });

    if (!blocks.length) {
      fail("产物区里没有带 `<!-- kind: xxx -->` 锚点的块 —— 抄块时把锚点一起带过来，校验靠它");
    } else if (blocks.length !== sorted.length) {
      fail("产物有 " + blocks.length + " 块，脚本有 " + sorted.length + " 个点 —— 多的删掉，少的补上");
    } else {
      const bad = [];
      blocks.forEach((b, i) => {
        const pt = sorted[i], at = "第 " + (i + 1) + " 块（" + b.kind + "）";
        if (b.kind !== pt.kind) bad.push(at + " 与脚本第 " + (i + 1) + " 点的 kind=" + pt.kind + " 对不上");
        if (!(Math.abs(b.inT - pt.start) < 0.001)) bad.push(at + " data-in=" + b.inT + "，脚本是 " + pt.start);
        if (!(Math.abs(b.outT - pt.end) < 0.001)) bad.push(at + " data-out=" + b.outT + "，脚本是 " + pt.end);
        if (!b.anim) bad.push(at + " 没有 data-anim");
        if (!b.phase) bad.push(at + " 没有 comp 的三态之一（raise / sunk / bare）");
      });
      bad.length ? bad.forEach(fail) : ok(blocks.length + " 块与脚本逐点对上（kind / 入点 / 出点）");

      /* 动效名不许自创 */
      const allowed = [...tpl.matchAll(/\[data-anim="([^"]+)"\]/g)].map(m => m[1]);
      const used = [...new Set(blocks.map(b => b.anim).filter(Boolean))];
      const made = used.filter(a => !allowed.includes(a));
      if (made.length) fail("产物用了本风格没有的动效名：" + made.join(" / ") + "（只有 " + allowed.join(" / ") + "）");
      else ok("动效名都在本风格内：" + used.join(" / "));

      /* ②→④ 契约：渲染器靠 CONFIG 认出「3:4 透明素材」 */
      const need = [["PURPOSE", "overlay"], ["BASE", "timeline"], ["BG", "transparent"], ["RATIO", "3:4"]];
      const miss = need.filter(function(kv){
        return !new RegExp("\\b" + kv[0] + "\\s*:\\s*'" + kv[1] + "'").test(html);
      });
      miss.length === 0 ? ok("CONFIG 段在（④ 渲染器靠它认出这是 3:4 透明素材）")
                        : fail("产物缺 CONFIG 的 " + miss.map(function(kv){ return kv[0] + ": '" + kv[1] + "'"; }).join(" / ")
                            + " —— 会被当成 16:9 成片，渲染器直接报错。CONFIG 在模板里，别删");

      /* 全片至少 3 种入场手感 */
      if (blocks.length >= 3 && used.length < 3) {
        warn("全片只用了 " + used.length + " 种入场手感 —— spec 第八节要求至少 3 种");
      }
    }
  }
}

/* ---------- 汇总 ---------- */

console.log("\n" + (fails ? "\u2717 FAIL " + fails + " 项" : "\u2713 PASS") + (warns ? "（" + warns + " 条提醒）" : ""));
process.exit(fails ? 1 : 0);