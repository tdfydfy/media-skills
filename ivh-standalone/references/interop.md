# 跨技能接口契约

> 三个技能共用同一套 HTML 产物契约。**改了这个文件里的任何一个名字，都必须同步改
> `ivh-render` 的读取逻辑** —— 否则渲染出来是错的，而且不会报错。

## 一、合成根属性（`ivh-render` 靠这些读数）

```html
<div id="stage"
     data-composition-id="infographic"
     data-width="1920"
     data-height="1080"
     data-duration="62.4"
     data-hud="1">
```
（`data-composition-id` 的具体值不重要，渲染器只判「非空」—— 它靠这个确认"这是一个可渲染产物"。）

| 属性 | 谁写 | 谁读 | 说明 |
|---|---|---|---|
| `data-composition-id` | 模板固定 | 渲染器 | 非空即认为这是一个可渲染产物 |
| `data-width` / `data-height` | 模板运行时按 `CONFIG.RATIO` 自写 | 渲染器 | 定画布尺寸，CLI 参数可覆写 |
| `data-duration` | 模板运行时自动算 | 渲染器 | `BASE=timeline` 取 `max(data-out)`；`text` 累加 `data-sec` |
| `data-hud` | 模板固定 | 渲染器 | 为 `1` 时渲染器会检查 HUD 是否已隐藏 |

**尺寸与时长永远由模板自写，不要在 HTML 里手填。** 手填的值一旦和实际内容不符，
渲染器会按错误尺寸出片。

## 二、时间轴运行时（截图探针靠这些名字）

```js
window.TL = { t, playing, duration, seek(sec), play(), pause() };
window.curScene;   // 分幕模式下的当前幕序号，时间轴模式恒为 0
```

| 名字 | 类型 | 说明 |
|---|---|---|
| `TL` | 全局对象 | **名字不可改**，`shoot-at.mjs` 通过它做探针读时 |
| `TL.seek(s)` | 方法 | 跳到第 s 秒并立即应用在场状态（不播放） |
| `TL.t` | 数字 | 当前时刻（秒） |
| `curScene` | 数字 | 分幕模式的当前幕，时间轴模式恒 `0` |

## 三、组件元素契约

```html
<div class="comp"
     data-in="12.4"
     data-out="16.8"
     data-anim="MASK-UP"
     data-out-anim="SCALE-OUT">
  ...组件内容...
</div>
```

| 属性 | 必填 | 说明 |
|---|---|---|
| `class="comp"` | 是 | **唯一识别标志**。缺了这个类，时间轴引擎不会管它 |
| `data-in` | 是 | 入场绝对秒 |
| `data-out` | 是 | 退场绝对秒，必须 > `data-in` |
| `data-anim` | 否 | 入场动效，缺省 `MASK-UP` |
| `data-out-anim` | 否 | 退场动效，缺省 `FADE-SHIFT` |

`.comp.in` 表示"在场"。**这三个名字（`TL` / `curScene` / `.in`）被截图脚本当探针用，
不要重命名。**

## 四、截图定位（`ivh-render` 的两个采样脚本靠这个）

| 模式 | 定位方式 | 例子 |
|---|---|---|
| `BASE='timeline'` | `?t=<秒>` | `file:///.../out.html?t=12.4` |
| `BASE='text'`（抽帧出片） | `?t=<秒>` | 同上 —— 模板把全局秒数换算成「第 k 幕 + 幕内偏移」定格 |
| `BASE='text'`（逐幕预览） | `#<幕号>`（1 起） | `file:///.../out.html#2` |

> **分幕模式同样是时间序列。** 少了 `?t=` 这条路，`BASE='text'` 的产物根本没法出片 ——
> 这是拆分后才发现并补上的缺口。

`?t=` 定位时会**暂停并冻结数字**（滚到终值），否则截图里的数字永远是 0。
这一条在模板运行时里已实现，不要去掉。

## 五、透明与输出格式

| `CONFIG.BG` | 输出 | 关键参数 |
|---|---|---|
| `transparent` | ProRes 4444（`yuva444p10le`，含 alpha） | 截图必须带 `--default-background-color=00000000` |
| `opaque` | H.264 MP4 | 无 |

**透明必须验证到底层像素。** `ffprobe` 报 `pix_fmt=yuva444p10le` 不代表真有透明 ——
通道可能全是 255（实心）。唯一可信的判据是抽 alpha 平面统计，
即 `ivh-render/scripts/check-alpha.mjs`（按时间点抽样，`render.mjs` 自动跑）。

> **不要用截图判断透明。** 截图里的白分不清是"透明"还是"白色"。
> 而且透明素材的真实效果只有叠到实拍上才看得见 —— 那是用户在不依赖本流水线的
> 剪辑软件里完成的，不是产物 HTML 能回答的问题。

## 六、HUD 三件套

导出前 `CONFIG.HIDE_HUD` 必须为 `true`。要藏的是**三样**：

- `#hud` —— 页码 / 计时控件
- `#kbd` —— 快捷键提示
- `#bar` —— 底部进度条 ← **最容易漏的一个**，透明素材里会留下一条彩色横杠

模板运行时已经三样一起处理，新增可隐藏元素时记得加进那个列表。
