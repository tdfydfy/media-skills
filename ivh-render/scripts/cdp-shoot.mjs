/**
 * cdp-shoot.mjs —— 单浏览器逐帧取样（ivh-render 的快路径）
 *
 * 为什么需要它：
 *   默认那条路是「每帧拉起一次 headless 浏览器 + 每次新建一个临时 profile」，
 *   实测 1.1s/帧。帧数一多，出片就是分钟级。
 *   本模块只开一个浏览器，用 CDP 逐帧驱动产物的 IVH.seekAt(t)，
 *   实测 0.10s/帧（同一台机器、同样的画面），约 11 倍。
 *
 * 与产物 HTML 的契约：
 *   产物必须暴露 window.IVH.seekAt(t) —— 它的职责是「把动画定格在 t、
 *   把计数器给终值」，由产物自己实现（见模板里的 10-B2 段）。
 *   这里只负责「在正确时刻按快门」，不复刻任何模板运行时逻辑。
 *
 * 注意：这条路要连 127.0.0.1 的调试端口。沙箱会隔离子进程网络的场合走不通，
 *   所以调用方必须准备回退到「每帧一个浏览器」的老路（shoot.mjs 已内置）。
 *   本模块失败时返回 null，不抛异常。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** 极简 CDP 客户端：一条 WebSocket，扁平会话。 */
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(url, timeout = 10000) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("CDP WebSocket 连接超时")), timeout);
      ws.onopen = () => { clearTimeout(t); res(); };
      ws.onerror = () => { clearTimeout(t); rej(new Error("CDP WebSocket 连接失败")); };
    });
    const c = new Cdp(ws);
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id && c.pending.has(m.id)) {
        const w = c.pending.get(m.id); c.pending.delete(m.id);
        m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result);
      }
    };
    return c;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

/** 起浏览器并等它把调试端口报出来（--remote-debugging-port=0 由系统分配，避免撞端口）。 */
function launchBrowser(browser, userDir, extraArgs = []) {
  const child = spawn(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--disable-background-networking",
    "--remote-debugging-port=0", `--user-data-dir=${userDir}`,
    ...extraArgs, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  const wsUrl = new Promise((res, rej) => {
    let buf = "";
    const t = setTimeout(() => rej(new Error("等不到浏览器的调试端口（可能是沙箱隔离子进程网络）")), 20000);
    child.stderr.on("data", d => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); res(m[1]); }
    });
    child.on("error", e => { clearTimeout(t); rej(e); });
    child.on("exit", () => { clearTimeout(t); rej(new Error("浏览器提前退出")); });
  });
  return { child, wsUrl };
}

/**
 * 逐帧取样。
 * @returns {Promise<Array<{t:number,png:string}>|null>} 失败（不可用）时返回 null，由调用方回退。
 */
export async function captureFrames({
  browser, file, times, outDir, filePrefix, size, scale = 1, transparent = false, log = () => {},
}) {
  const userDir = path.join(os.tmpdir(), `ivh-cdp-${process.pid}-${Math.random().toString(36).slice(2)}`);
  let child = null, cdp = null;
  try {
    /* 这条快路径靠 Node 自带的 WebSocket 直连调试端口。
       老一点的 Node（<22）没有这个全局对象 —— 明确说清楚，别丢一个
       "WebSocket is not defined" 让人去猜；调用方会据此回退到 cli 引擎。 */
    if (typeof WebSocket === "undefined")
      throw new Error(`当前 Node（${process.version}）没有全局 WebSocket —— 单浏览器引擎需要 Node 22+；`
        + `要么升级 Node，要么用 --engine cli`);
    fs.mkdirSync(userDir, { recursive: true });
    const launched = launchBrowser(browser, userDir);
    child = launched.child;
    cdp = await Cdp.connect(await launched.wsUrl);

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
      const shot = await S("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      const png = path.join(outDir, `${filePrefix}${String(t).padStart(7, "0").replace(".", "_")}.png`);
      fs.writeFileSync(png, Buffer.from(shot.data, "base64"));
      shots.push({ t, png });
      log(shots.length, times.length, t, (Date.now() - t0) / shots.length);
    }
    return shots;
  } catch (e) {
    log(0, times.length, null, 0, e.message);
    return null;
  } finally {
    if (cdp) cdp.close();
    if (child && !child.killed) { try { child.kill(); } catch {} }
    await sleep(120);
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch {}
  }
}
