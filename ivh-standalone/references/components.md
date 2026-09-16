# 幕 · 分带 · 版式

> 组件库（C01~C15）、动效清单、组件状态机与运行时契约在共享层
> `../../ivh-html-core/components.md` —— 那是唯一副本。
> 本文件只讲**独立成片自己的结构**。

独立成片有两条排版路径，**由 `BASE` 选择**：

| BASE | 结构单元 | 节奏来源 | 适合 |
|---|---|---|---|
| `text` | 一幕一屏（`<section class="scene">`） | 幕自己的 `data-sec` | 无逐字稿 / 无严格时间码 |
| `timeline` | 组件（`.comp`）带 `data-in/out` | 外部时间码 | 有脚本时间码，要卡点 |

---

## 一、分幕模式（`BASE='text'`）

```html
<section class="scene active" data-sec="6">
  <div class="kicker anim">2026 · 市场观察</div>
  <div class="h1 anim">渠道下沉<br>带来<span class="hl">结构性</span>增长</div>
  <div class="body anim">华东区同比增速跑赢大盘。</div>
</section>
```

- 幕覆盖全屏、顺序轮播、**互斥**（同一时刻只有一幕 active）
- `data-sec` 决定这一幕停留几秒；总时长 = Σ `data-sec`
- 幕内 `.anim` 元素按 CSS 的 `animation-delay` 依次入场
- 定位 `#<幕号>`（1 起）—— 逐幕预览与外部跳转都靠它
- `#stage` 内**至少 2 幕**，通常 3 幕以上才有叙事弧

### 幕内元素（标题三件套）

| 类名 | 用途 | 字号 |
|---|---|---|
| `.kicker` | 眉题 / 上下文（"2026 · 市场观察"） | 小 |
| `.h1` | 主标题大字 | `--fs-h1` |
| `.h2` | 次级标题 | `--fs-h2` |
| `.body` | 正文说明 | `--fs-body` |
| `.hl` / `.hl2` | 标题内的强调高亮 | 继承 |

---

## 二、时间轴模式（`BASE='timeline'`）

```html
<div class="comp"
     data-in="5.6" data-out="13.4"
     data-roll="A"               <!-- 主张 / 证据 -->
     data-anim="MASK-LEFT"
     data-out-anim="SCALE-OUT">
  ...组件内容...
</div>
```

组件元素的三态、`class="comp"` 契约、`?t=` 定位见共享层
`../../ivh-html-core/components.md` 第一节。**独立成片多一个 `data-roll`（下一节）。**

---

## 三、A-roll / B-roll 分带

用 `data-roll` 把一屏分成上下两带 —— 主张在上，证据在下：

```
┌──────────────────────────┐
│   三线城市贡献过半         │  ← A-roll（主张）
│                          │
│   ├──────── 54%          │
│   ├────── 31%            │  ← B-roll（证据）
│   ├──── 15%              │
└──────────────────────────┘
```

一屏可以只有 A（开场、收尾），也可以 A+B 同屏（主体）。
**B 比 A 晚 0.4~0.8s 入场** —— 让观众先读到主张，再看证据。
落点由模板处理：写 `data-roll` 就自动落到对应带，不用手写坐标。

---

## 四、生成素材（A-roll 的另一条路）

```html
<div class="comp" data-in="0.4" data-out="5.2" data-roll="A" data-anim="MASK-UP">
  <img src="data:image/png;base64,..." alt="">     <!-- 或 <video autoplay muted loop> -->
</div>
```

**必须是内联资源**（`data:` URI 或内联 SVG）—— 任何外部 `src` 都会让自检第 2 项 FAIL。

---

## 五、时间轴规则

- **停留**：每个组件 ≥0.8s。4 个字的标签 0.8s 勉强；8 个字以上建议 ≥1.5s。
- **与脚本对齐**：A-roll 入点 = 该幕起始秒（主张先出）；
  B-roll 入点 = A-roll + 0.4~0.8s（证据跟上）；退点 = 该幕结束秒，同幕 A/B 尽量同退。
- **总时长**：`BASE='text'` → Σ `data-sec`；`BASE='timeline'` → `max(data-out)`。
  模板自动写入合成根 `data-duration`（以内容为准）。
