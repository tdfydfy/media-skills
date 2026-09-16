/**
 * active-windows.mjs —— 产物 HTML → 「哪些秒数上有画面」
 *
 * 为什么需要它：
 *   透明素材的时间轴大段是全透明的 —— 规格是 60s 做 8~12 个素材点，
 *   等于 70%~85% 的时间一个可见像素都没有。均匀抽帧会把空档也逐帧渲染一遍，
 *   每一帧都要拉起浏览器（或驱动一次快门），纯属白干。
 *
 *   实测（ivh-overlay 官方 fixture，1080x1440，BG=transparent）：
 *     t=5.0s 与 t=18.0s 两个空档时刻截出的 PNG **逐字节相同** ——
 *     MD5 一致、alpha 平面全 0、连文件大小都一样（9318B）。
 *   既然空档帧必然一样，就没理由渲染第二次：渲染一张、其余复用，
 *   成片画面一点不变（shoot.mjs 复用前会对那一张实测 alpha）。
 *
 * 判据全部来自产物源码，不含任何猜测：
 *   · 组件在场区间 = [data-in, data-out + OUT_DUR]
 *     OUT_DUR 是退场动画时长，直接从产物里读（模板里是 0.4s；改了这里跟着变）
 *   · BG='transparent' 时模板关掉了 #stage 及其纹理层（区块 8「透明背景降级」），
 *     组件是唯一的可见内容 → 区间之外必定全透明
 *   两条都由 ivh-overlay / ivh-standalone 模板保证。所以这里给的只是「计划」，
 *   真复用之前仍要实测定夺（前提变了就退回均匀抽帧，见 shoot.mjs）。
 *
 * 谁在用：shoot.mjs（决定渲染哪些帧）、render.mjs（按同一份计划估耗时）。
 *   两边共用这里的函数，避免「估值」和「实际」各算各的。
 */
import { execFileSync } from "node:child_process";

/** 退场动画时长兜底值（读不到产物里的 OUT_DUR 时用它，与模板默认一致）。 */
export const DEFAULT_OUT_DUR = 0.4;

/** 在场区间两侧各留一点余量，防模板微调后正好切在边界上。 */
const PAD = 0.1;

/** 比这还短的「空档」不值得单独复用（来回切换的开销大于收益）。 */
const MIN_BLANK_GAP = 0.3;

/**
 * 从产物源码里读出组件与退场时长。
 * @returns {{comps: Array<{in:number,out:number}>, outDur:number}}
 */
export function parseComps(html) {
  /* 先剥掉 HTML 注释：模板里的 TL_DEMO 示例块是注释，但它同样含 data-in/data-out，
     不剥掉的话时间轴会被示例数字带偏。 */
  const bare = html.replace(/<!--[\s\S]*?-->/g, "");
  const outDur = parseFloat((html.match(/\bOUT_DUR\s*=\s*([\d.]+)/) || [])[1]) || DEFAULT_OUT_DUR;
  const comps = [...bare.matchAll(/<div[^>]*class="[^"]*\bcomp\b[^"]*"[^>]*>/g)].map(m => {
    const g = k => {
      const mm = m[0].match(new RegExp('data-' + k + '="([^"]*)"'));
      return mm ? parseFloat(mm[1]) : null;
    };
    return { in: g("in"), out: g("out") };
  }).filter(c => Number.isFinite(c.in) && Number.isFinite(c.out));
  return { comps, outDur };
}

/**
 * 合并出「有内容」的连续区间。
 * data-out <= data-in 的组件永远不会可见（模板里 visible 判据取交集），直接忽略。
 * @returns {Array<[number,number]>} 升序、互不重叠
 */
export function activeSpans(comps, outDur = DEFAULT_OUT_DUR, pad = PAD) {
  const raw = comps
    .filter(c => Number.isFinite(c.in) && Number.isFinite(c.out) && c.out > c.in)
    .map(c => [c.in - pad, c.out + outDur + pad])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of raw) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

/** t 时刻是否落在某个有内容的区间里。 */
export function isActive(spans, t) {
  for (const [a, b] of spans) if (t >= a && t <= b) return true;
  return false;
}

/** 把时间对齐到帧栅格：第 k 帧恰好是 k/fps 秒。 */
export function quantize(t, fps) { return Math.round(t * fps) / fps; }

/** 由时间反查它属于第几帧。栅格已经量化过时，这里不会再出现 .999999 这种毛刺。 */
export function frameIndex(t, fps) { return Math.round(t * fps); }

/**
 * 按固定间隔铺满整条时间轴（与抽帧循环、ffmpeg 输入帧率同一口径）。
 *
 * fps > 0 且 step 正好是整数个帧周期时，时间点在**帧号**上推进（k*per/fps），
 * 结果是精确的：相邻间隔恒等于 step，下游按 diff 反推的采样帧率就正好等于
 * 1/step，而不是 29.9976 这种数 —— 后者会让 `-framerate` 与 `-r` 对不齐，
 * 成片末尾悄悄错开小半帧。末点向上取整到栅格，保证最后一帧也落在格上。
 *
 * step 不是整数帧周期时（渲染 normal 档的 0.04s = 1.2 帧）无法两者兼得，
 * 退回原来的三位小数口径 —— 宁可不量化，也不要为了量化把间隔弄成忽长忽短。
 */
export function uniformTimes(duration, step, fps = 0) {
  const per = fps > 0 ? Math.round(step * fps) : 0;
  if (per > 0 && Math.abs(step * fps - per) < 1e-9) {
    const n = Math.ceil((duration * fps) / per);
    /* 印 9 位小数：帧名 / index.txt 里落的就是这个值，而 1e-9 s 的误差乘回帧号
       只有 3e-8，frameIndex() 全程精确。印 6 位就做不到（0.033333 差 1e-5 帧）。 */
    return Array.from({ length: n + 1 }, (_, k) => +(k * per / fps).toFixed(9));
  }
  const times = [];
  for (let t = 0; t <= duration + 1e-6; t += step) times.push(+t.toFixed(3));
  if (times[times.length - 1] < duration) times.push(+duration.toFixed(3));
  return times;
}

/** [0, duration] 里最长的空档。 */
export function largestGap(spans, duration) {
  let best = null, cursor = 0;
  const consider = (a, b) => {
    if (b - a > (best ? best.len : 0)) best = { from: a, to: b, len: b - a, mid: (a + b) / 2 };
  };
  for (const [a, b] of spans) {
    if (a > cursor) consider(cursor, a);
    cursor = Math.max(cursor, b);
  }
  if (duration > cursor) consider(cursor, duration);
  return best;
}

/**
 * 采样计划：均匀铺满的 times 里哪些有内容、哪些是空档，空档该取哪一秒去渲染那一张。
 * @param fps 成片恒定帧率（见 uniformTimes）；给了就让时间点落在帧栅格上。
 * @returns {{comps:Array, outDur:number, spans:Array, times:number[],
 *            activeTimes:number[], blankT:number|null}}
 *   blankT = 最长空档的中点；没有值得复用的空档时为 null（那就按均匀抽帧走）。
 */
export function samplePlan(html, duration, step, fps = 0) {
  const { comps, outDur } = parseComps(html);
  const spans = activeSpans(comps, outDur);
  const times = uniformTimes(duration, step, fps);
  const activeTimes = times.filter(t => isActive(spans, t));
  const gap = largestGap(spans, duration);
  const usable = gap && gap.len >= MIN_BLANK_GAP && activeTimes.length > 0 && activeTimes.length < times.length;
  return { comps, outDur, spans, times, activeTimes, blankT: usable ? +gap.mid.toFixed(3) : null };
}

/**
 * 一张 PNG 的 alpha 平面是不是全 0 —— 用于「空档帧真的全透明」这一次实测。
 * 这是空档复用的唯一前提，所以宁可花一次 ffmpeg 的时间把它验掉。
 * @returns {true|false|null} true=全透明 / false=有内容 / null=读不出（没 ffmpeg、或根本没有 alpha 通道）
 */
export function alphaIsEmpty(ffmpeg, png) {
  if (!ffmpeg) return null;
  try {
    const buf = execFileSync(ffmpeg, [
      "-hide_banner", "-v", "error", "-i", png,
      "-vf", "alphaextract", "-frames:v", "1",
      "-f", "rawvideo", "-pix_fmt", "gray", "-",
    ], { maxBuffer: 512 * 1024 * 1024, timeout: 60000, stdio: ["ignore", "pipe", "ignore"] });
    for (const b of buf) if (b !== 0) return false;
    return true;
  } catch { return null; }
}
