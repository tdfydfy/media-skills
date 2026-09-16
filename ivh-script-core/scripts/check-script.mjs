#!/usr/bin/env node
/**
 * check-script.mjs —— 脚本文件契约校验（两个脚本技能的交付闸门）
 *
 * 用法：node scripts/check-script.mjs <脚本.json> [--stamp]
 * 退出码：0 = 全过（允许 note）；1 = 有 FAIL
 *
 * 按 meta.purpose 自动分支：standalone 查 scenes，overlay 查 points 与形态锁定。
 * 所以两条支线共用这一份校验器 —— 规则只有一处，不会各自漂移。
 *
 * --stamp  把 {pass, fails, notes, hash, at} 写进 meta.check。
 *          下游 ivh-standalone / ivh-overlay 开跑前先验这个章：
 *          **没盖章、或 hash 与当前内容不符，直接拒收。**
 *          为什么要盖章：出过「校验根本没跑，但交付文档里写着 ✅ 通过」的事 ——
 *          没有凭据的闸门，只是一句话。
 *
 * 校验 script-format.md 第二节的 8 条结构硬规则 + 第 7 项「提炼度」
 *（提炼链的写法见 distillation.md）。
 * 下游 ivh-standalone / ivh-overlay 拿到脚本后应先跑这一遍 ——
 * 上游没校验就交过来的脚本，在这里必须挡住，不要带病往下游走。
 */
import fs from "node:fs";
import crypto from "node:crypto";

const argv = process.argv.slice(2);
const FILE = argv.find(a => !a.startsWith("--"));
const STAMP = argv.includes("--stamp");
if (!FILE) {
  console.error("用法：node scripts/check-script.mjs <脚本.json> [--stamp]");
  process.exit(2);
}

/* 内容指纹：覆盖除 meta.check 以外的全部字段 —— 脚本改一个字，章就失效。
   盖章本身不改变指纹（算之前先摘掉 meta.check），所以重复盖章是幂等的。 */
const docHash = d => {
  const c = JSON.parse(JSON.stringify(d));
  if (c.meta) delete c.meta.check;
  return crypto.createHash("sha256").update(JSON.stringify(c)).digest("hex").slice(0, 16);
};

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
const CONTENT = m.contentType;
const VALID_PURPOSE = ["standalone", "overlay"];
const VALID_RATIO   = ["16:9", "9:16", "4:3", "3:4"];
const VALID_BG      = ["opaque", "transparent"];
const VALID_STYLE   = ["doodle", "riso", "blueprint", "minimal", "neon", "pixel"];
const VALID_CONTENT = ["data", "narrative", "drama", "opinion"];

["title", "purpose", "contentType", "totalDuration", "ratio", "bg", "style"].forEach(k => {
  const v = m[k];
  if (v === undefined || v === null || v === "") fail(`meta.${k} 缺失`);
});
VALID_PURPOSE.includes(PURPOSE) ? ok(`purpose='${PURPOSE}'`)
  : fail(`purpose='${PURPOSE}' 非法（应为 ${VALID_PURPOSE.join(" | ")}）`);
VALID_CONTENT.includes(CONTENT) ? ok(`contentType='${CONTENT}'`)
  : fail(`contentType='${CONTENT}' 非法（应为 ${VALID_CONTENT.join(" | ")}）`
      + " —— 这一项决定提炼抓手，漏了会让叙事型内容按数据型去圈数字，静默失效");
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

  /* 密度随 contentType 分档：剧情的信息由画面承担，贴片只做梗与转折 ——
     拿数据型的 8~12 去要求一部短剧，只会逼出"每句话都贴一块"的噪音。
     阈值 = 档位两端各留余量（data 档算出来就是原来的 5 / 14）。 */
  const BAND = {
    data:      [8, 12, "研报口播"],
    narrative: [4, 7,  "故事案例"],
    drama:     [3, 5,  "剧情短剧"],
    opinion:   [5, 8,  "观点评论"],
  };
  const [lo, hi, label] = BAND[CONTENT] || BAND.data;
  const per60 = p.length / Math.max(m.totalDuration, 1) * 60;
  const bandTxt = `${lo}~${hi} 个/60s（${CONTENT}·${label}）`;
  if (per60 < lo * 0.6) note(`每 60s 仅 ${per60.toFixed(1)} 个呼应点 —— 低于 ${bandTxt}，检查是否有该强调的内容漏了`);
  else if (per60 > hi * 1.2) fail(`每 60s 有 ${per60.toFixed(1)} 个呼应点 —— 超出 ${bandTxt}，叠加层会变成第二块屏`);
  else ok(`密度 ${per60.toFixed(1)} 个/60s，落在 ${bandTxt} 内`);

  /* 与 check-template 第 9 项同一条硬线：13 种入场里挑 3 种是底线。
     素材生命周期只有 3~5 秒，入场就是它的全部表演，三块板一个手感等于没设计。 */
  const anims = [...new Set(p.map(x => x.anim).filter(Boolean))];
  anims.length >= 3 ? ok(`用到 ${anims.length} 种入场动效：${anims.join(" / ")}`)
    : fail(`只用到 ${anims.length} 种入场动效 —— 需 >=3（13 种里挑 3 种即可），三块板一个手感等于没设计`);
}

/* ---------- 5b · 动效名合法性 ----------
   模板里只实现了这些动效。名字写错不会报错 —— 只会静默不动，
   而"这块板没动"在下游看起来像设计选择，能一路混到成片里。 */
const ANIM_IN  = ["MASK-UP", "MASK-LEFT", "BLUR-IN", "DRAW-UNDER", "SCALE-POP",
                  "STAGGER-IN", "HARD-IN", "POP-IN", "PIXEL-IN", "GROW",
                  "FADE-IN", "CALM-IN", "SHIFT-IN", "NONE"];
const ANIM_OUT = ["FADE-SHIFT", "SCALE-OUT", "SLIDE-OUT", "FADE-OUT"];
head("5b. 动效名");
{
  const bad = [];
  const pick = (arr, key, i, allowed, tag) => {
    const v = arr[i][key];
    if (v && !allowed.includes(v)) bad.push(`${tag}[${i}].${key}='${v}'`);
  };
  const S = Array.isArray(doc.scenes) ? doc.scenes : [];
  const P = Array.isArray(doc.points) ? doc.points : [];
  S.forEach((_, i) => pick(S, "anim", i, ANIM_IN, "scenes"));
  P.forEach((_, i) => { pick(P, "anim", i, ANIM_IN, "points"); pick(P, "outAnim", i, ANIM_OUT, "points"); });
  bad.length ? fail(`动效名不在模板清单内：${bad.join(" / ")}`)
             : ok(`动效名合法（入场 ${ANIM_IN.length} 种 / 退场 ${ANIM_OUT.length} 种）`);
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

/* ---------- 7 · 提炼度 ---------- */
head("7. 提炼度");
{
  /* 前六项查的是「结构对不对」，查不出「话有没有劲」：
     一份通篇「内容概述 / 渠道问题 / 提升效果」的脚本，字数、区间、结构全合规，
     照样 100% 通过闸门 —— "平淡"就是这么流到下游的。这一项补上提炼度里
     能静态验的部分。怎么写见 distillation.md。 */
  const strip = s => String(s == null ? "" : s)
    .replace(/[\s，。！？、；：""''（）()《》「」【】·—…\-!?.,;:"']/g, "");

  /* 「标题里没有内容」的三种形态：客套、结构占位、自我指涉 */
  /* 自我指涉（「我是…」）在剧情 / 叙事里是台词，不是空转 ——
     一句「我是来下棋的不是来逃命的」被判成自我介绍式空转，是这条规则踩过的真实坑。
     所以只在 data / opinion 里启用；drama / narrative 只查结构占位。 */
  const AIRY_SELF = [
    /^(大家好|你们好|各位好|我是)/,
  ];
  const AIRY_PLACEHOLDER = [
    /(今天|本期|这一期|这期|接下来)(我们)?(来讲|来说|来聊|聊聊|聊一聊|分享|看看|看)/,
    /^(开场|开篇|引言|前言|序|背景|背景介绍|背景概述|概述|概览|导语|正文|小结|总结|结语|结尾|尾声|收尾|回顾|预告|目录|全文)$/,
    /^(内容)?(概述|概览|摘要|简介)$/,
    /^(相关|基本)(情况|介绍|说明|内容)$/,
    /^(谢谢(大家|观看|收看)?|感谢(观看|收看|大家)?)$/,
    /^以上就是(今天|本次|本期)?.{0,6}$/,
    /^第[一二三四五六七八九十0-9]{1,3}(部分|章|节|幕|块|讲|点)?$/,
    /^[一二三四五六七八九十0-9]{1,3}(部分|章|节|幕|块|讲)$/,
  ];
  const AIRY = (CONTENT === "data" || CONTENT === "opinion")
    ? [...AIRY_SELF, ...AIRY_PLACEHOLDER]
    : AIRY_PLACEHOLDER;
  /* 主张标记：数字 / 对比 / 变化 / 判断。有它才叫「结论」，没有就只是「话题」 */
  const CLAIM = /[0-9]|[vV][sS]|对比|相比|相较|从.{1,8}到|涨|跌|降|升|增|减|翻|倍|成|折|超|低于|高于|不如|反而|其实|不是|才是|没有|过半|占|达|破|跑赢|贡献|拿下|撑起|意味着|必须|应该/;
  const SLOGAN = /提升|提高|增强|优化|完善|加强|促进|推动|打造|赋能|助力|实现|全面|深化|持续/;

  /* 收集所有"给人看的字"：A-roll 标题 + 素材点元素 */
  const titles = [];
  scenes.forEach(s => {
    const t = s.aroll && s.aroll.type === "title" ? s.aroll.text : null;
    if (t) titles.push({ where: `第 ${s.i} 幕(${s.role})`, text: t, role: s.role, num: /[0-9]/.test(t) });
  });
  points.forEach(p => (p.elements || []).forEach((e, k) => {
    if (!e || !e.t) return;
    const raw = String(e.t) + " " + (e.v || "") + " " + (e.label || "");
    titles.push({ where: `素材点 ${p.i} 元素${k + 1}`, text: e.t, role: "element", num: /[0-9]/.test(raw) });
  }));

  if (!titles.length) {
    skip("没有屏幕字（A-roll 标题 / 素材点元素），本项不适用");
  } else {
    /* 7.1 空转标题 —— 带主张标记的引述 / 金句豁免 */
    /* 判据：命中 AIRY 但句中含有数字 / 对比 / 判断词（CLAIM）的，不算空转。
       引述句常以「我是…」起头，豁免之后不会再被误判成自我介绍。 */
    const airy = titles.filter(x => x.text.split("\n").some(l => {
      const n = strip(l);
      if (!n) return true;
      return AIRY.some(re => re.test(n)) && !CLAIM.test(n);
    }));
    airy.length === 0
      ? ok(`${titles.length} 条屏幕字里没有空转标题`)
      : fail(`${airy.length} 条标题是空转（客套 / 结构占位 / 自我指涉，读不出内容）：`
          + airy.slice(0, 3).map(x => `${x.where}「${strip(x.text)}」`).join("；"));

    /* 7.2 重复：同一句话只该说一次 */
    const seen = new Map(), dup = [];
    for (const x of titles) {
      const k = strip(x.text);
      if (!k) continue;
      if (seen.has(k)) dup.push(`${seen.get(k)} 与 ${x.where}「${k}」`);
      else seen.set(k, x.where);
    }
    dup.length === 0
      ? ok("屏幕字两两不重复")
      : fail(`${dup.length} 处屏幕字重复：${dup.slice(0, 3).join("；")}`);

    /* 7.3 body 幕的标题要是「一句话」，不能只是名词短语 */
    const bodyTitles = titles.filter(x => x.role === "body");
    if (!bodyTitles.length) {
      skip("没有 body 幕标题，7.3 不适用");
    } else {
      const flat = bodyTitles.filter(x => !CLAIM.test(strip(x.text)));
      flat.length === 0
        ? ok(`${bodyTitles.length} 条 body 标题都带主张标记（数字 / 对比 / 判断）`)
        : fail(`${flat.length} 条 body 标题只是名词短语、没有主张：`
            + flat.slice(0, 3).map(x => `${x.where}「${strip(x.text)}」`).join("；")
            + " —— 标题要给结论，话题留给口播");
    }

    /* 7.4 抓手覆盖率（note：程度问题，不是对错问题）
       数据型看「带数字的比例」；叙事 / 剧情型本来就没有数字，
       拿数字率去量它只会稳定地报假警 —— 改成看「有没有转折 / 代价标记」。 */
    if (CONTENT === "data" || CONTENT === "opinion") {
      const rate = Math.round(100 * titles.filter(x => x.num).length / titles.length);
      if (rate < 40) note(`只有 ${rate}% 的屏幕字带数字 —— 数字是最省力的「具体」`);
    } else {
      const TURN = /(?:其实|不是|而是|反而|却|原来|以为|结果|代价|换来|失去|牺牲|再也|从此|终于|偏偏|竟然|只剩|只是)/;
      const turnRate = Math.round(100 * titles.filter(x => TURN.test(strip(x.text))).length / titles.length);
      if (turnRate < 40) note(`只有 ${turnRate}% 的屏幕字带转折 / 代价标记 —— 叙事型内容靠落差立住，平铺直叙读不出重点`);
    }

    /* 7.5 开场钩子 / 收尾金句 */
    const openT = titles.find(x => x.role === "open");
    if (openT && !CLAIM.test(strip(openT.text)))
      note(`开场标题「${strip(openT.text)}」没有钩子（数字 / 反差 / 反常识）—— 前三秒决定看不看下去`);
    const closeT = titles.find(x => x.role === "close");
    if (closeT) {
      const n = strip(closeT.text);
      if (n.length > 12 || /^(总之|综上|总的来说|好了)/.test(n))
        note(`收尾标题「${n}」不像能单独拿出去的话 —— 金句要短、要能被引用`);
    }

    /* 7.6 口号式标题：有形容词、没有数字 */
    const slogan = titles.filter(x => SLOGAN.test(x.text) && !x.num);
    if (slogan.length) note(`${slogan.length} 条标题是口号式（有形容词、没有数字）：`
      + slogan.slice(0, 3).map(x => `「${strip(x.text)}」`).join(""));

    /* 7.7 素材模式：一块板只有一个元素 = 字幕卡，不是素材 */
    if (PURPOSE === "overlay") {
      const thin = points.filter(p => (p.elements || []).length === 1);
      if (thin.length) note(`${thin.length} 个素材点只有 1 个元素 —— 缺关系层，观众记不住（见 material-spec 第一节）`);
      const noNum = points.filter(p => p.kind === "data" && !/[0-9]/.test(JSON.stringify(p.elements || [])));
      if (noNum.length) note(`${noNum.length} 个数据型素材点里一个数字都没有`);
    }
  }
}

/* ---------- 校验凭据 ---------- */
/* 章不是装饰：下游据此判断"这份脚本到底跑没跑过闸门"。 */
const HASH = docHash(doc);
const prevCheck = doc.meta && doc.meta.check;

console.log("\n== 校验凭据 ==");
if (prevCheck) {
  if (prevCheck.hash === HASH) {
    ok(`已盖章，指纹一致（${HASH} · ${prevCheck.at}）`);
  } else if (STAMP) {
    note(`旧章已失效（盖章后内容被改过），本次重盖`);
  } else {
    fail(`meta.check 指纹与当前内容不符（章上写 ${prevCheck.hash}，实为 ${HASH}）`
      + ` —— 脚本在盖章后被改过，章已失效，请重跑 --stamp`);
  }
} else {
  note(`未盖章 —— 下游会拒收，交付前请加 --stamp`);
}

/* ---------- 盖章 ---------- */
if (STAMP) {
  doc.meta = doc.meta || {};
  doc.meta.check = {
    pass: fails === 0,
    fails,
    notes,
    hash: HASH,
    at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + "\n", "utf8");
}

/* ---------- 结论 ---------- */
console.log("\n== 结论 ==");
if (fails === 0) {
  console.log(`  自检通过。（${notes} 条提示）`);
  console.log(STAMP ? `  已盖章 → meta.check.hash=${HASH}` : `  未盖章 —— 交付前请加 --stamp`);
  process.exit(0);
} else {
  console.log(`  ${fails} 项待处理：`);
  if (STAMP) console.log(`  已写入 meta.check（pass=false）—— 下游验章会直接拒收`);
  process.exit(1);
}
