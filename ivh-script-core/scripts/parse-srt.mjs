#!/usr/bin/env node
/**
 * parse-srt.mjs —— SRT 字幕 → JSON 时间轴
 *
 * 用法：
 *   node scripts/parse-srt.mjs 字幕.srt                  # 输出到 stdout
 *   node scripts/parse-srt.mjs 字幕.srt 时间轴.json       # 输出到文件
 *   node scripts/parse-srt.mjs 字幕.srt --merge 1.2      # 合并间距 <1.2s 的相邻句
 *   node scripts/parse-srt.mjs 字幕.srt --candidates     # 附上「值得可视化」的候选句
 *   node scripts/parse-srt.mjs 字幕.srt --candidates --content drama --anchor tail
 *
 * --content  data | narrative | drama | opinion        （默认 data）
 *            决定候选句的规则集。数据型看数字 / 占比 / 趋势；
 *            叙事型看转折 / 代价 / 命名；剧情型另看冲突 / 身份 / 情绪。
 *            **规则集不对，候选句会直接是 0 条 —— 那不是"内容没料"，是抓手选错了。**
 *
 * --anchor   sync | head | tail                        （不传则三个都输出）
 *            候选句的入点约定。**不同 purpose 不一样，别用一个默认值糊过去：**
 *              sync = 句首         概念 / 名词，边说边出
 *              head = 句首 + 0.15  结构 / 预告，先给框架
 *              tail = 句尾 + 0.30  数字 / 结论，先听后看
 *            `standalone` 三条都用；`overlay` 的数字型一律 tail —— 提前出现会剧透，
 *            观众的注意力被图形牵走，反而听不到口播的推理。
 *
 * 输出：
 *   { content, count, duration, cues:[{index,start,end,text,dur}], candidates:[...] }
 *
 * candidates[].anchors 同时给出三个候选入点，由阶段一按 purpose + contentType 挑，
 * 本脚本不再替上游写死一种约定。
 */

import fs from "node:fs";
import path from "node:path";

/* ---------- CLI ---------- */
const argv = process.argv.slice(2);
const FILE = argv.find(a => !a.startsWith("--") && /\.(srt|vtt|txt)$/i.test(a)) || argv[0];
if (!FILE) {
  console.error("用法: node scripts/parse-srt.mjs <字幕.srt> [输出.json] [--merge 秒] [--candidates] [--content data|narrative|drama|opinion] [--anchor sync|head|tail]");
  process.exit(1);
}
const abs = path.resolve(FILE);
if (!fs.existsSync(abs)) { console.error("文件不存在: " + abs); process.exit(1); }

/* 参数取值位置，用来把 flag 的值从位置参数里排除掉 */
const FLAG_VAL = new Set();
["--merge", "--content", "--anchor"].forEach(n => {
  const i = argv.indexOf(n);
  if (i >= 0) FLAG_VAL.add(i + 1);
});
const outIdx = argv.findIndex((a, i) => i > 0 && !a.startsWith("--") && !FLAG_VAL.has(i));
const OUT = outIdx >= 0 && /\.json$/i.test(argv[outIdx]) ? path.resolve(argv[outIdx]) : null;

const flagVal = (name, def) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};

const MERGE = Number(flagVal("merge", "0")) || 0;
const WITH_CAND = argv.includes("--candidates");

const CONTENT_LIST = ["data", "narrative", "drama", "opinion"];
const CONTENT = flagVal("content", "data");
if (!CONTENT_LIST.includes(CONTENT)) {
  console.error(`--content 非法：${CONTENT}（应为 ${CONTENT_LIST.join(" | ")}）`);
  process.exit(1);
}

const ANCHOR_LIST = ["sync", "head", "tail"];
const ANCHOR = (() => {
  const i = argv.indexOf("--anchor");
  if (i < 0) return null;
  const v = argv[i + 1];
  if (!ANCHOR_LIST.includes(v)) {
    console.error(`--anchor 非法：${v}（应为 ${ANCHOR_LIST.join(" | ")}）`);
    process.exit(1);
  }
  return v;
})();

/* ---------- 解析 ---------- */
const raw = fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

/* 时间码：00:00:01,200 --> 00:00:03,400   （VTT 用 . 也可） */
const toSec = s => {
  const m = s.trim().match(/(?:(\d+):)?(\d+):(\d+)[,.](\d+)/);
  if (!m) return null;
  const [, h = "0", mm, ss, ms] = m;
  return (+h) * 3600 + (+mm) * 60 + (+ss) + (+ms.padEnd(3, "0").slice(0, 3)) / 1000;
};

const cues = [];
{
  /* 以空行分块 */
  const blocks = raw.split(/\n{2,}/);
  for (const b of blocks) {
    const lines = b.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    /* 跳过 VTT 头 */
    if (/^WEBVTT/i.test(lines[0])) continue;

    let i = 0, index = null;
    if (/^\d+$/.test(lines[0])) { index = Number(lines[0]); i = 1; }

    const tl = lines[i];
    if (!tl || !/-->/.test(tl)) continue;
    const [a, b2] = tl.split("-->");
    const start = toSec(a), end = toSec(b2);
    if (start === null || end === null) continue;

    const text = lines.slice(i + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")        /* 去 VTT 标签 */
      .replace(/\{[^}]*\}/g, "")      /* 去 ASS 标签 */
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;

    cues.push({ index: index ?? cues.length + 1, start, end, text });
  }
}

if (!cues.length) { console.error("没有解析到任何字幕块。请确认是标准 SRT/VTT 格式。"); process.exit(1); }

/* ---------- 合并相邻短句 ---------- */
let merged = cues;
if (MERGE > 0) {
  merged = [];
  for (const c of cues) {
    const last = merged[merged.length - 1];
    if (last && c.start - last.end <= MERGE) {
      last.end = c.end;
      last.text = (last.text + c.text).replace(/\s+/g, "");
    } else {
      merged.push({ ...c });
    }
  }
  merged.forEach((c, i) => { c.index = i + 1; });
}

/* ---------- 补齐 dur ---------- */
merged.forEach(c => {
  c.start = +c.start.toFixed(3);
  c.end   = +c.end.toFixed(3);
  c.dur   = +(c.end - c.start).toFixed(3);
});

/* ---------- 语气词过滤 ---------- */
/* 「啊」「哈哈哈」「嗯……」这类句子没有信息量，却会占掉一个候选位。
   剧情型内容里这类句子能占到两三成，不滤掉会一路干扰到屏幕字与口播的重复检查。 */
const INTERJECTION = /^[啊呀哇哦嗯呃唉哎哈嘿喂嘛吧呢噢哟诶嘻呵呦，。！？、…～~\s]{1,8}$/;

/* ---------- 候选句启发式（按 contentType 分规则集） ---------- */

/* 数据型：靠"刻度"。数字 / 占比 / 趋势 / 对比 / 列举 / 定义 / 结论 */
const RULES_DATA = [
  { tag: "数字",   rx: /[\d]+(?:\.\d+)?\s*(?:%|％|倍|万|亿|个|人|元|年|天|次)/, comp: "c-data" },
  { tag: "对比",   rx: /不是.{1,12}(?:而是|是)|(?:反而|相比|对比|差距|超过|低于)|≠/,        comp: "c-vs" },
  { tag: "列举",   rx: /(?:第[一二三四五六七八九十]|首先|其次|最后|一是|二是|三是|三个|两点|几点)/, comp: "c-list" },
  { tag: "定义",   rx: /(?:所谓|指的是|意思是|本质上|说白了|其实就是)/,                     comp: "c-kw" },
  { tag: "结论",   rx: /(?:所以|因此|归根结底|说到底|结论是|关键在于|真正的问题)/,            comp: "c-quote" },
  { tag: "趋势",   rx: /(?:从.{1,10}到.{1,10}|一直|逐年|持续|趋势|上升|下降|增长|下滑)/,      comp: "c-line" },
  { tag: "占比",   rx: /(?:占|贡献|份额|比例|超过一半|大部分|绝大多数)/,                      comp: "c-bar" },
];

/* 叙事型：靠"转折"。数据型那套（数字 / 占比 / 趋势）在故事里几乎不命中 ——
   实测 31 句短剧台词过 RULES_DATA 是 **0 条**。换的不是阈值，是抓手本身：
   数据靠刻度，叙事靠转折、代价、反差、命名、决断。 */
const RULES_NARRATIVE = [
  { tag: "转折",   rx: /(?:原来|本以为|以为|结果|没想到|反而|偏偏|竟然|却|谁知|不料)/,        comp: "c-vs" },
  { tag: "代价",   rx: /(?:代价|换来|失去|牺牲|付出|赔|输掉|输了|赢不了|回不去)/,                 comp: "c-cmp" },
  { tag: "反差",   rx: /不是.{1,12}(?:而是|是)|(?:相比|对比|差距)/,                          comp: "c-vs" },
  { tag: "命名",   rx: /(?:叫做?|称之为|这就是|所谓)/,                                       comp: "c-kw" },
  { tag: "决断",   rx: /(?:我必须|我要|从此|再也|绝不|只能|认了|算了)/,                        comp: "c-quote" },
  { tag: "时间锚", rx: /(?:那天|那一年|那年|后来|当初|终于|小时候|很多年后)/,                  comp: "c-line" },
];

/* 剧情型：在叙事之外多一层"对举 / 冲突 / 身份 / 情绪" ——
   剧情里能做成贴片的往往是这几处，而不是信息。

   对举是短剧台词里**最强的标题信号**：得失两极在同一句里共现。
   「赢了这一局，输掉的是一整个师」这种句子任何单一关键词规则都抓不到 ——
   它的力量来自两个极性词的对照，所以用 lookahead 查共现，不要求相邻。 */
const RULES_DRAMA = [
  ...RULES_NARRATIVE,
  { tag: "对举",   rx: /(?:赢|胜)(?=[^。！？]{0,16}(?:输|败|丢|失去|代价))|(?:输|败|失去)(?=[^。！？]{0,16}(?:赢|胜|得到|换来))/, comp: "c-cmp" },
  { tag: "冲突",   rx: /(?:凭什么|你敢|闭嘴|滚|不服|算什么东西|轮不到|少来)/,                  comp: "c-quote" },
  { tag: "身份",   rx: /(?:我是|你是谁|他是我|你以为)/,                                      comp: "c-kw" },
  { tag: "情绪",   rx: /(?:可笑|荒唐|过分|可怜|舍不得|后悔|心疼|绝望|疯了)/,                   comp: "c-quote" },
];

/* opinion（观点 / 评论）与叙事型共用：这类内容也靠转折与反差立论，不靠刻度。 */
const RULE_SETS = {
  data: RULES_DATA,
  narrative: RULES_NARRATIVE,
  drama: RULES_DRAMA,
  opinion: RULES_NARRATIVE,
};
const RULES = RULE_SETS[CONTENT];

const candidates = [];
for (const c of merged) {
  if (INTERJECTION.test(c.text)) continue;      /* 无信息量，不占候选位 */
  const hits = RULES.filter(r => r.rx.test(c.text));
  if (!hits.length) continue;

  /* 三个候选入点，不是三个建议 —— 选哪个由 purpose + 内容类型定 */
  const anchors = {
    sync: +c.start.toFixed(2),
    head: +(c.start + 0.15).toFixed(2),
    tail: +(c.end + 0.30).toFixed(2),
  };

  candidates.push({
    index: c.index,
    start: c.start,
    end: c.end,
    dur: c.dur,
    text: c.text,
    tags: hits.map(h => h.tag),
    suggest: [...new Set(hits.map(h => h.comp))],
    anchors,
    ...(ANCHOR ? { suggestIn: anchors[ANCHOR] } : {}),
    suggestOut: +c.end.toFixed(2),
  });
}

/* ---------- 输出 ---------- */
const result = {
  source: path.basename(abs),
  content: CONTENT,
  anchor: ANCHOR || "all",
  count: merged.length,
  duration: merged.length ? +Math.max(...merged.map(c => c.end)).toFixed(3) : 0,
  merged: MERGE > 0,
  cues: merged,
};
if (WITH_CAND) {
  result.candidates = candidates;
  result.candidateCount = candidates.length;
}

const json = JSON.stringify(result, null, 2);
if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json, "utf8");
  console.log(`已写出 ${OUT}`);
  console.log(`  句子 ${result.count} 条 · 总长 ${result.duration}s · 体裁 ${CONTENT} · 入点 ${result.anchor}`);
  if (WITH_CAND) {
    console.log(`  候选句 ${candidates.length} 条：`);
    for (const c of candidates.slice(0, 20)) {
      const a = c.anchors;
      console.log(`    [${String(c.start).padStart(7)}-${String(c.end).padStart(7)}] ${c.tags.join("/").padEnd(8)} ${c.suggest.join(",").padEnd(20)} 入点 sync=${a.sync} head=${a.head} tail=${a.tail}  ${c.text.slice(0, 24)}`);
    }
    if (candidates.length > 20) console.log(`    … 另有 ${candidates.length - 20} 条`);
  }
} else {
  console.log(json);
}
