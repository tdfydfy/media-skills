# 幕 · 组件库 · 动效

独立成片有两条排版路径，**由 `BASE` 选择，不要混用**：

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
- 定位：`#<幕号>`（1 起）—— 逐幕截图与外部跳转都靠它
- `#stage` 内**至少 2 幕**，通常 3 幕以上才有叙事弧（开场 / 主体 / 收尾）

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
     data-roll="A"            <!-- 主张 / 证据 -->
     data-anim="MASK-LEFT"    <!-- 入场动效 -->
     data-out-anim="SCALE-OUT"><!-- 退场动效 -->
  ...组件内容...
</div>
```

### 状态机

任一时刻 `t`，组件处于三态之一：

```
      入场动画          停留            退场动画
  ├─────────────┼──────────────┼─────────────┤
  data-in                     data-out   data-out+0.4
```

| 区间 | class | 视觉 |
|---|---|---|
| `t < data-in` | （无） | 不可见 |
| `[data-in, data-out)` | `.in` | 可见 |
| `[data-out, data-out+0.4)` | `.out` | 播退场动画 |
| `t >= data-out+0.4` | （无） | 不可见 |

### 运行时契约

```js
TL = { t, playing, duration, seek(s), play(), pause() }
```

**`TL` / `curScene` / `.in` 这三个名字不要改** —— 截图脚本的探针依赖它们。

### 定位

- `?t=9.0` → 跳到第 9 秒（静态核对 / 截图用），会暂停并**把数字冻结到终值**
- 不带参数 → 从 0 开始自动播放（仅 `ANIMATE=true` 时）

---

## 三、A-roll / B-roll 分带

独立成片的叙事骨架。用 `data-roll` 把一屏分成上下两带：

| 轨道 | `data-roll` | 内容 | 落点 |
|---|---|---|---|
| **A-roll** | `A` | **主张**：标题大字 / 生成素材（`<img>` / `<video>`） | 上半带 |
| **B-roll** | `B` | **证据**：数据 / 图表 / 清单 | 下半带 |

```
┌──────────────────────────┐
│   三线城市贡献过半         │  ← A-roll（主张）
│                          │
│   ├──────── 54%          │
│   ├────── 31%            │  ← B-roll（证据）
│   ├──── 15%              │
└──────────────────────────┘
```

- 一屏**可以只有 A**（开场、收尾），也可以 **A+B 同屏**（主体）
- **B 比 A 晚 0.4~0.8s 入场** —— 让观众先读到主张，再看证据
- **同场共存的组件必须写 `data-roll`**，否则两条都居中会叠在一起

> 分带是模板自动处理的（`html[data-purpose="standalone"] .comp[data-roll="A"]`），
> 写 `data-roll` 就会自动落到对应带，不用手写坐标。

---

## 四、组件库（15 种）

类名一律 `c-` 前缀。**不要一个卡片用到死** —— 一手经验：每 3 个组件至少换 1 种样式。

### 基础组件（C01~C12）

| # | 类名 | 用途 |
|---|---|---|
| C01 | `c-data` | 超大数字 + 归因标签 |
| C02 | `c-capsule` | 胶囊标签，短归因（**≤6 字**） |
| C03 | `c-kw` | 关键词大字，无容器 |
| C04 | `c-vs` | 对比卡 `A ≠ B`（横排） |
| C05 | `c-quote` | 引述，竖线 + 斜体 |
| C06 | `c-rule` | 强调下划线 |
| C07 | `c-list` | 清单，逐条 |
| C08 | `c-bar` | 横向柱状条 |
| C09 | `c-ring` | 环形进度 |
| C10 | `c-line` | 折线趋势 |
| C11 | `c-step` | 步骤编号 |
| C12 | `c-note` | 便签，补充信息 |

### 关系型组件（C13~C15）

自带元素之间的排布关系。**竖版构图时优先用它们**（横排会被挤成窄条）：

| # | 类名 | 关系 | 元素数 |
|---|---|---|---|
| C13 | `c-flow` | **流向**（有方向，可挂标签） | 2 块 + 1 箭头 |
| C14 | `c-stack` | **递进**（宽度递减） | 层数（≤3） |
| C15 | `c-cmp` | **对照**（无方向） | 2 块 + 1 分隔 |

### 用法示例

**C01 数据卡片**
```html
<div class="c-data">
  <div class="v"><span class="num" data-to="37" data-prefix="+" data-suffix="%" data-dur="1">+0%</span></div>
  <div class="k">同比增速 · 华东区</div>
</div>
```
`data-to` 目标值 · `data-prefix`/`data-suffix` 前后缀 · `data-dec` 小数位 · `data-dur` 滚动时长（秒）

**C04 对比卡**
```html
<div class="c-vs">
  <span class="side">不是技术问题</span>
  <span class="mid">≠</span>
  <span class="side">是组织问题</span>
</div>
```
第一个 `.side` 自动加删除线，第二个自动高亮。

**C08 柱状条**
```html
<div class="c-bar">
  <div class="row">
    <div class="lb"><span>三线及以下</span><b>54%</b></div>
    <div class="track"><div class="fill" style="width:54%"></div></div>
  </div>
</div>
```

**C09 环形进度**
```html
<div class="c-ring">
  <svg viewBox="0 0 140 140">
    <circle class="ring-bg" cx="70" cy="70" r="62"/>
    <circle class="ring-fg" cx="70" cy="70" r="62" data-pct="62"/>
  </svg>
  <div class="cap"><b>62%</b>份额</div>
</div>
```

**C10 折线趋势**
```html
<div class="c-line">
  <svg viewBox="0 0 400 160">
    <path class="axis" d="M0 150 H400"/>
    <path class="line-path" d="M10 130 L90 100 L170 110 L250 70 L330 40 L390 20"/>
    <circle class="dot" cx="390" cy="20" r="7"/>
  </svg>
</div>
```
路径长度由 JS 自动写入 `--len`，无需手填。

**C13 纵向流向**
```html
<div class="c-flow">
  <div class="st"><div class="t">一线城市</div><div class="v">40%</div></div>
  <div class="ar"><span class="rl">渠道下沉</span></div>
  <div class="st to"><div class="t">三四线</div><div class="v">70%+</div></div>
</div>
```

**C15 上下对照**
```html
<div class="c-cmp">
  <div class="side a"><span class="lb">去年</span><span class="tx">12%</span></div>
  <div class="vs">VS</div>
  <div class="side b"><span class="lb">今年</span><span class="tx">37%</span></div>
</div>
```

### 生成素材（A-roll 的另一条路）

A-roll 除了用标题排版，也可以放**生成素材**（生图 / 生视频的产出）：

```html
<div class="comp" data-in="0.4" data-out="5.2" data-roll="A" data-anim="MASK-UP">
  <img src="data:image/png;base64,..." alt="">     <!-- 或 <video autoplay muted loop> -->
</div>
```

⚠️ **必须是内联资源**（`data:` URI 或内联 SVG）。单文件铁律 —— 任何外部 `src` 都会让自检第 2 项 FAIL。

---

## 五、动效

### 入场（`data-anim`，省略则 `MASK-UP`）

| 名称 | 手感 | 适合 |
|---|---|---|
| `MASK-UP` | 从下往上擦出 | 通用，最稳 |
| `MASK-LEFT` | 从左往右擦出 | 标题、横向序列 |
| `BLUR-IN` | 从模糊到清晰 | 概念浮现 |
| `SCALE-POP` | 缩放弹入，带回弹 | 数字、图表 |
| `POP-IN` | 弹性放大 | 趣味、收尾 |
| `HARD-IN` | 快速下压，无缓动 | 强调、警告 |
| `DRAW-UNDER` | 横向拉开 | 下划线、分隔线 |
| `GROW` | 从底部纵向生长 | 柱状图 |
| `PIXEL-IN` | 阶梯式逐行显现 | pixel 风格 |
| `STAGGER-IN` | 轻微位移 + 微旋 | doodle 风格 |
| `FADE-IN` | 纯淡入 | 最克制 |
| `CALM-IN` | 极其克制的小位移 | minimal 风格 |
| `SHIFT-IN` | 从右滑入 | 补位 |

### 退场（`data-out-anim`，省略则 `FADE-SHIFT`）

`FADE-SHIFT` 淡出上移 · `SCALE-OUT` 淡出缩小 · `SLIDE-OUT` 淡出左移 · `FADE-OUT` 纯淡出

退场统一 `0.4s`。

### 多样性

- 单条视频内 **≥3 种入场动效**（第 9 项给 note）
- 模板整体 **≥4 种不同 keyframes**（第 8 项校验）

独立成片是**完整叙事**，动效应当**服务于内容**：开场可以冲，主体克制，收尾干净。

---

## 六、时间轴设计规则

### 停留时长

**每个组件停留 ≥0.8s**（第 9 项校验）。
参考：4 个字的标签 0.8s 勉强；8 个字以上建议 ≥1.5s。

### 与脚本对齐

时间码来自 `ivh-script` 产出的脚本 JSON：

- **A-roll 入点 = 该幕起始秒**（主张先出）
- **B-roll 入点 = A-roll + 0.4~0.8s**（证据跟上）
- **退点 = 该幕结束秒**，同幕的 A/B 尽量同退，收得干净

### 不要塞太满

**每 8~12 秒最多 2~3 个组件。**
3 分钟的视频，组件总数 25~40 个比较合适。

### 总时长

`BASE='text'` → Σ `data-sec`；`BASE='timeline'` → `max(data-out)`。
模板自动写入合成根 `data-duration`，不要手填。

---

## 七、自检

```bash
node scripts/check-template.mjs 产物.html      # 十一项，纯文本，秒级
```

**然后打开 HTML 看，不要抽帧。**

```bash
# ❌ 不要这样做 —— 每帧拉起一次浏览器，几十秒的片子就是几分钟
node ../ivh-render/scripts/shoot.mjs 产物.html --step 3
```

模板带 `AUTOPLAY`，打开就是完整节奏；空格暂停、点页码跳幕。
看的时候盯这几条：

- [ ] 每幕 / 每个组件是否**严格在其入点之后**才出现
- [ ] 是否有内容**突然消失**（说明退点设错）
- [ ] 停留是否够读完整段文字
- [ ] 同场共存的组件是否用 `data-roll` 分了带
- [ ] 组件是否换着用（不要一路 `c-data`）
- [ ] 数字卡片里显示的是**终值**，不是 0

自己抽帧属于重复劳动：既不比用户看得准，还慢。**效果好不好由用户点头。**
