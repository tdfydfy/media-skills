#!/usr/bin/env node
/**
 * parse-srt.mjs —— SRT 字幕 → JSON 时间轴
 *
 * 用法：
 *   node scripts/parse-srt.mjs 字幕.srt                  # 输出到 stdout
 *   node scripts/parse-srt.mjs 字幕.srt 时间轴.json       # 输出到文件
 *   node scripts/parse-srt.mjs 字幕.srt --merge 1.2      # 合并间距 <1.2s 的相邻句
 *   node scripts/parse-srt.mjs 字幕.srt --candidates     # 附上「值得可视化」的候选句
 *
 * 输出：
 *   { count, duration, cues:[{index,start,end,text,dur}], candidates:[...] }
 *
 * candidates 是启发式挑出的「含数字/对比/列举/结论」的句子，
 * 供阶段一决定哪些句子该做组件用。
 */

import fs from "node:fs";
import path from "node:path";

/* ---------- CLI ---------- */
const argv = process.argv.slice(2);
const FILE = argv.find(a => !a.startsWith("--") && /\.(srt|vtt|txt)$/i.test(a)) || argv[0];
if (!FILE) {
  console.error("用法: node scripts/parse-srt.mjs <字幕.srt> [输出.json] [--merge 秒] [--candidates]");
  process.exit(1);
}
const abs = path.resolve(FILE);
if (!fs.existsSync(abs)) { console.error("文件不存在: " + abs); process.exit(1); }

const outArg = argv.slice(1).find(a => !a.startsWith("--"));
const OUT = outArg && /\.json$/i.test(outArg) ? path.resolve(outArg) : null;
const MERGE = (() => {
  const i = argv.indexOf("--merge");
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) || 0 : 0;
})();
const WITH_CAND = argv.includes("--candidates");

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

/* ---------- 候选句启发式 ---------- */
const RULES = [
  { tag: "数字",   rx: /[\d]+(?:\.\d+)?\s*(?:%|％|倍|万|亿|个|人|元|年|天|次)/, comp: "c-data" },
  { tag: "对比",   rx: /不是.{1,12}(?:而是|是)|(?:反而|相比|对比|差距|超过|低于)|≠/,        comp: "c-vs" },
  { tag: "列举",   rx: /(?:第[一二三四五六七八九十]|首先|其次|最后|一是|二是|三是|三个|两点|几点)/, comp: "c-list" },
  { tag: "定义",   rx: /(?:所谓|指的是|意思是|本质上|说白了|其实就是)/,                     comp: "c-kw" },
  { tag: "结论",   rx: /(?:所以|因此|归根结底|说到底|结论是|关键在于|真正的问题)/,            comp: "c-quote" },
  { tag: "趋势",   rx: /(?:从.{1,10}到.{1,10}|一直|逐年|持续|趋势|上升|下降|增长|下滑)/,      comp: "c-line" },
  { tag: "占比",   rx: /(?:占|贡献|份额|比例|超过一半|大部分|绝大多数)/,                      comp: "c-bar" },
];

const candidates = [];
for (const c of merged) {
  const hits = RULES.filter(r => r.rx.test(c.text));
  if (!hits.length) continue;
  candidates.push({
    index: c.index,
    start: c.start,
    end: c.end,
    dur: c.dur,
    text: c.text,
    tags: hits.map(h => h.tag),
    suggest: [...new Set(hits.map(h => h.comp))],
    /* 入点建议：句子起始 + 0.15s（留起拍感） */
    suggestIn:  +(c.start + 0.15).toFixed(2),
    suggestOut: +c.end.toFixed(2),
  });
}

/* ---------- 输出 ---------- */
const result = {
  source: path.basename(abs),
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
  console.log(`  句子 ${result.count} 条 · 总长 ${result.duration}s`);
  if (WITH_CAND) {
    console.log(`  候选句 ${candidates.length} 条（>10s 的密集段建议不超过 2-3 个组件）：`);
    for (const c of candidates.slice(0, 20)) {
      console.log(`    [${String(c.start).padStart(7)}-${String(c.end).padStart(7)}] ${c.tags.join("/").padEnd(8)} ${c.suggest.join(",").padEnd(20)} ${c.text.slice(0, 26)}`);
    }
    if (candidates.length > 20) console.log(`    … 另有 ${candidates.length - 20} 条`);
  }
} else {
  console.log(json);
}
