/**
 * cdp-shoot.mjs —— 单浏览器逐帧取样（ivh-render 的快路径）
 *
 * 为什么需要它：
 *   默认那条路是「每帧拉起一次 headless 浏览器 + 每次新建一个临时 profile」，
 *   实测 1.1s/帧。帧数一多，出片就是分钟级。
 *   本模块只开一个浏览器，用 CDP 逐帧驱动产物的 IVH.seekAt(t)，
 *   实测 0.131s/帧（同一台机器、同样的画面），约 8 倍。
 *
 * 单帧耗时构成（1920×1080 实测，快压关掉时）：
 *   seek + 双 rAF（样式/布局/绘制落地）  10.9 ms    5%
 *   读回像素 + PNG 编码 + base64 + 传输  223 ms    95%   ← 瓶颈在这
 *   ★ 所以加速手段只有两个：这里的 optimizeForSpeed（2.2 倍，已是默认）、
 *     以及 shoot.mjs 那边的「多进程并行」。开 GPU 只值 15%，
 *     走管道 / 不落盘都动不了这一段 —— 编码在浏览器进程内部就完成了。
 *   ★ 并行别指望 ÷N：实测 8 逻辑核 / 374 帧，3 路 29s（1.76×）、6 路 30s
 *     —— 3 路就饱和，超线程对 zlib 无效。
 *
 * 「一路」= 一个浏览器。要多路并行由 shoot.mjs 分片、各起一个本模块实例，
 * 本模块不负责调度，只负责「给我一串时刻，我把帧落盘」。
 *
 * 两种传输，自动择优（IVH_CDP_TRANSPORT=auto|pipe|ws 可强制）：
 *   pipe  --remote-debugging-pipe：CDP 消息走子进程的 fd3/fd4，一个字节的网络都不用。
 *         首选。回环被安全软件（电脑管家 / 360 的网络防护）或防火墙拦掉的机器上照样能跑。
 *   ws    --remote-debugging-port=0：走 127.0.0.1 上的 DevTools WebSocket。备用。
 *         回环被拦时表现为 connect ETIMEDOUT，auto 会自动跳到下一种。
 *
 * 与产物 HTML 的契约：
 *   产物必须暴露 window.IVH.seekAt(t) —— 它的职责是「把动画定格在 t、
 *   把计数器给终值」，由产物自己实现（见模板里的 10-B2 段）。
 *   这里只负责「在正确时刻按快门」，不复刻任何模板运行时逻辑。
 *
 * 两种传输都失败时返回 null，不抛异常，由调用方回退到「每帧一个浏览器」的老路。
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TRANSPORT = (process.env.IVH_CDP_TRANSPORT || "auto").toLowerCase();

/**
 * 连整棵进程树一起端掉。
 * 浏览器是「主进程 + 一堆 child」的结构，`child.kill()` 只杀得掉主进程：
 * 剩下的子进程继续活着、占着临时 profile，随后的目录删除会一直磨（实测卡死 2 分钟以上），
 * 临时目录也就越积越多。Windows 上必须用 `taskkill /T`。
 */
function killTree(child) {
  if (!child || child.killed || !child.pid) return;
  try {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true, timeout: 5000 });
    else child.kill("SIGKILL");
  } catch {}
  try { child.kill(); } catch {}
}

/* ==========================================================================
   传输层：两种实现，接口一致 —— send(method, params, sessionId) / close()
   ========================================================================== */

/** WebSocket 传输（浏览器 --remote-debugging-port=0）。 */
class CdpWs {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.how = "WebSocket"; }
  static async connect(url, timeout = 8000) {
    const ws = new WebSocket(url);
    try {
      await new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error("CDP WebSocket 连接超时")), timeout);
        ws.onopen = () => { clearTimeout(t); res(); };
        ws.onerror = () => { clearTimeout(t); rej(new Error("CDP WebSocket 连接失败")); };
      });
    } catch (e) {
      /* 失败的 socket 要显式关掉：底层连接尝试可能还要挂着十几秒（SYN 重传），
         留着会拖住事件循环、也拖住调用方退出。 */
      try { ws.close(); } catch {}
      throw e;
    }
    const c = new CdpWs(ws);
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id && c.pending.has(m.id)) {
        const w = c.pending.get(m.id); c.pending.delete(m.id);
        clearTimeout(w.t);
        m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result);
      }
    };
    return c;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      /* 单个命令也要有上限：浏览器卡住时不能把整趟出片拖死。 */
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`CDP 命令超时（${method}）`)); }, 30000);
      this.pending.set(id, { res, rej, t });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  close() { for (const w of this.pending.values()) clearTimeout(w.t); try { this.ws.close(); } catch {} }
}

/**
 * 管道传输（浏览器 --remote-debugging-pipe）。
 * 约定：我们往 fd3 写命令，从 fd4 读应答，每条消息以 \0 结尾（Edge 153 / Chrome 106+ 实测）。
 * 整条链路都在父子进程的匿名管道里，不经过 TCP —— 回环被拦的机器上这是唯一的路。
 */
class CdpPipe {
  constructor(child) {
    this.id = 0;
    this.pending = new Map();
    this.out = child.stdio[3];   /* 写：命令发给浏览器 */
    this.in = child.stdio[4];    /* 读：浏览器的应答 */
    this.how = "管道";
    let buf = "";
    this.in.on("data", chunk => {
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\0")) >= 0) {
        const raw = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!raw.trim()) continue;
        let m; try { m = JSON.parse(raw); } catch { continue; }
        if (m.id && this.pending.has(m.id)) {
          const w = this.pending.get(m.id); this.pending.delete(m.id);
          clearTimeout(w.t);
          m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result);
        }
      }
    });
  }
  static async connect(child, timeout = 12000) {
    const c = new CdpPipe(child);
    await c.send("Browser.getVersion", {}, undefined, timeout);   /* 探活 */
    return c;
  }
  send(method, params = {}, sessionId, timeout = 30000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`CDP 命令超时（${method}）`)); }, timeout);
      this.pending.set(id, { res, rej, t });
      this.out.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0");
    });
  }
  close() {
    for (const w of this.pending.values()) { clearTimeout(w.t); w.rej(new Error('CDP closed')); }
    this.pending.clear();
    this.in.destroy();
    this.out.destroy();
  }
}

/* ==========================================================================
   起浏览器
   ========================================================================== */

/* IVH_GPU=1 时不加 --disable-gpu，让显卡接管光栅化。
   实测收益有限（单帧 234 → 199 ms，−15%）：瓶颈在 PNG 编码，不在光栅化。
   默认关着还有两个非性能理由：软件光栅化在本机验证过确定性（40/40 逐字节一致）；
   双显卡机器上换后端可能随电源状态漂移，那会破坏「同产物两次出片一致」这条底线。 */
const GPU = process.env.IVH_GPU === "1";
const BASE_ARGS = [
  "--headless=new", ...(GPU ? [] : ["--disable-gpu"]), "--hide-scrollbars",
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--disable-background-networking",
];

/**
 * 起浏览器并拿到传输层。
 * ★ 浏览器一 spawn 出来就登记进 `state.child`，**不能等函数返回** ——
 *   连不上时函数是抛错的，调用方根本拿不到返回值，那个浏览器进程就成了孤儿：
 *   它不会被杀、一直占着临时 profile，调用方的 stderr 管道还被它吊着 → 进程永不退出。
 *
 * @param {string} browser 浏览器可执行文件
 * @param {string} userDir 临时 profile
 * @param {"pipe"|"ws"} how 传输方式
 * @param {{child?: import("node:child_process").ChildProcess}} state 用来把子进程交还给调用方
 * @returns {Promise<{cdp}>}
 */
async function launch(browser, userDir, how, state) {
  if (how === "pipe") {
    const child = spawn(browser, [
      ...BASE_ARGS, "--remote-debugging-pipe", `--user-data-dir=${userDir}`, "about:blank",
    ], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
    state.child = child;
    /* 必须把 stderr 排掉：缓冲填满会把浏览器自己堵死。只留尾部做诊断。 */
    let tail = "";
    child.stderr.on("data", d => { tail = (tail + d.toString()).slice(-2000); });
    const exited = new Promise((_, rej) =>
      child.on("exit", () => rej(new Error("浏览器提前退出：" + tail.slice(-300)))));
    const cdp = await Promise.race([CdpPipe.connect(child), exited]);
    return { cdp };
  }

  /* WebSocket：--remote-debugging-port=0 由系统分配端口，避免撞端口。 */
  const child = spawn(browser, [
    ...BASE_ARGS, "--remote-debugging-port=0", `--user-data-dir=${userDir}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  state.child = child;
  const wsUrl = new Promise((res, rej) => {
    let buf = "";
    const t = setTimeout(() => rej(new Error("等不到浏览器的调试端口")), 20000);
    child.stderr.on("data", d => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); res(m[1]); }
    });
    child.on("error", e => { clearTimeout(t); rej(e); });
    child.on("exit", () => { clearTimeout(t); rej(new Error("浏览器提前退出")); });
  });
  const ws = await wsUrl;
  /* 端口报出来不等于已经在 accept，直连常吃一个瞬时的 ECONNREFUSED —— 重试几次。
     超时给得短：这条路上「连不上」多半是被防火墙/安全软件 DROP，
     等下去也是白等，早点把控制权交给下一种传输（或 cli）。 */
  let lastErr = null;
  for (let i = 0; i < 5; i++) {
    try { return { cdp: await CdpWs.connect(ws, 3000) }; }
    catch (e) { lastErr = e; await sleep(200); }
  }
  throw new Error(`${new URL(ws).host} 连不上（${lastErr ? lastErr.message : "原因不明"}）`
    + " —— 回环被防火墙或安全软件拦了？");
}

/* ==========================================================================
   一趟取样
   ========================================================================== */

async function captureWith(how, { browser, file, times, outDir, filePrefix, size, scale, transparent, log }) {
  const userDir = path.join(os.tmpdir(), `ivh-cdp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  const state = {};                       /* launch() 会把子进程写进来，哪怕它随后抛错 */
  let cdp = null;
  try {
    fs.mkdirSync(userDir, { recursive: true });
    ({ cdp } = await launch(browser, userDir, how, state));

    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const S = (m, p) => cdp.send(m, p, sessionId);

    await S("Page.enable");
    await S("Runtime.enable");
    if (transparent) {
      /* 等价于 --default-background-color=00000000：不这样设，headless 会铺不透明白底，
         截出的 PNG 根本没有 alpha 通道，合成出来就是一块实心白板（头号事故）。 */
      await S("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    }
    await S("Emulation.setDeviceMetricsOverride", {
      width: size.w, height: size.h, deviceScaleFactor: scale, mobile: false,
    });
    await S("Page.navigate", { url: "file:///" + file.replace(/\\/g, "/").replace(/ /g, "%20") });

    /* 等产物就绪：它必须自己实现 IVH.seekAt（老产物没有，等不到就回退）。 */
    let ready = false;
    for (let i = 0; i < 100; i++) {
      const r = await S("Runtime.evaluate", {
        expression: "!!(window.IVH && typeof IVH.seekAt === 'function' && document.readyState === 'complete')",
        returnByValue: true,
      });
      if (r.result.value) { ready = true; break; }
      await sleep(100);
    }
    if (!ready) throw new Error("产物没有暴露 IVH.seekAt(t)，无法用单浏览器引擎取样");
    /* 字体没加载完就截图，文字会用兜底字形 —— 与逐帧浏览器那条路的结果对不上。 */
    await S("Runtime.evaluate", {
      expression: "document.fonts ? document.fonts.ready : Promise.resolve(1)",
      awaitPromise: true, returnByValue: true,
    });

    const shots = [];
    const t0 = Date.now();
    for (const t of times) {
      /* 定格 + 等两帧 rAF，确保样式变更已经落到合成帧上再按快门 */
      await S("Runtime.evaluate", {
        expression: `(() => { IVH.seekAt(${t});
          return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))); })()`,
        awaitPromise: true, returnByValue: true,
      });
      /* ★ optimizeForSpeed —— PNG 的无损快压。这是这条链路上唯一真能提速的旋钮：
         单帧抓取 187 → 85 ms（2.2 倍），代价只是体积 0.37 → 0.68 MB。
         编码占单帧耗时的 84%~91%（远大于光栅化的 4%~9%），所以调它才有效，
         开 GPU / 走管道 / 不落盘 都动不了这一段。
         换 JPEG 还能再快一点（79 ms），但有损：4:2:0 色度抽样，细文字边缘会出色晕。 */
      const shot = await S("Page.captureScreenshot", {
        format: "png", fromSurface: true, captureBeyondViewport: false, optimizeForSpeed: true,
      });
      const png = path.join(outDir, `${filePrefix}${String(t).padStart(7, "0").replace(".", "_")}.png`);
      fs.writeFileSync(png, Buffer.from(shot.data, "base64"));
      shots.push({ t, png });
      log(shots.length, times.length, t, (Date.now() - t0) / shots.length, null, how);
    }
    return shots;
  } catch (e) {
    log(0, times.length, null, 0, e.message, how);
    return null;
  } finally {
    if (cdp) cdp.close();
    killTree(state.child);
    /* 子进程的 stderr 管道也要放掉：句柄不关，事件循环就被吊着不退出。 */
    try { state.child?.stderr?.destroy(); } catch {}
    try { state.child?.stdout?.destroy(); } catch {}
    for (const stream of state.child?.stdio || []) { try { stream?.destroy(); } catch {} }
    state.child?.unref();
    await sleep(150);
    /* 删不掉就删不掉：临时目录留着不致命，卡在这儿才致命（整棵进程树已端掉，正常是瞬时完成）。 */
    try { fs.rmSync(userDir, { recursive: true, force: true, maxRetries: 2, retryDelay: 120 }); } catch {}
  }
}

/**
 * 清掉往趟留下的临时 profile。只动 1 小时前的 —— 另一个进程可能正在用新目录。
 * 有这一步是因为：进程被杀 / 崩溃时，profile 目录会留在系统临时区里越积越多。
 */
function sweepStaleProfiles(maxAgeMs = 3600_000) {
  try {
    const tmp = os.tmpdir(), now = Date.now();
    for (const n of fs.readdirSync(tmp)) {
      if (!n.startsWith("ivh-cdp-")) continue;
      const p = path.join(tmp, n);
      try {
        if (now - fs.statSync(p).mtimeMs < maxAgeMs) continue;
        fs.rmSync(p, { recursive: true, force: true, maxRetries: 1, retryDelay: 100 });
      } catch {}
    }
  } catch {}
}

/**
 * 逐帧取样。
 * @returns {Promise<Array<{t:number,png:string}>|null>} 失败（不可用）时返回 null，由调用方回退。
 */
export async function captureFrames(opts) {
  sweepStaleProfiles();
  const order = TRANSPORT === "auto" ? ["pipe", "ws"] : [TRANSPORT];
  for (const how of order) {
    const res = await captureWith(how, { scale: 1, ...opts });
    if (res) return res;
  }
  return null;
}
