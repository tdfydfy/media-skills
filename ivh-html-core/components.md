# HTML 产物词汇表：组件 · 动效 · 时间轴契约

> **共享层**：`ivh-standalone` 与 `ivh-overlay` 的产物都用这套词汇。
> 本文件是唯一副本 —— 组件名、动效名是模板里写死的字符串，改这里必须同步改
> 两个技能各自的 `assets/template.html` 运行时，否则**写错名字不会报错，只是那块板不动**。
>
> 两个技能各自的结构章节（分幕、A/B 分带、素材点规模）在各自目录下，不在这里。

---

## 一、组件元素

```html
<div class="comp"
     data-in="12.4"            <!-- 入场时刻（绝对秒） -->
     data-out="16.8"           <!-- 退场时刻（绝对秒），必须 > data-in -->
     data-anim="MASK-UP"       <!-- 入场动效，省略则 MASK-UP -->
     data-out-anim="SCALE-OUT"><!-- 退场动效，省略则 FADE-SHIFT -->
  ...组件内容...
</div>
```

`class="comp"` 是**唯一识别标志** —— 缺了这个类，时间轴引擎不会管它。

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

`0.4s` 是退场动画时长，写死在运行时里，必须与 CSS `.comp.out` 的
`animation-duration` 一致。

### 运行时契约

```js
TL = { t, playing, duration, seek(s), play(), pause() }
window.curScene;   // 分幕模式下的当前幕；时间轴模式恒为 0
```

**`TL` / `curScene` / `.in` 这三个名字不要改** —— 截图脚本的探针依赖它们。

### 定位

- `?t=9.0` → 跳到第 9 秒（静态核对 / 截图用），会暂停并**把数字冻结到终值**
- `#<幕号>`（1 起）→ 逐幕预览（仅 `BASE='text'`）
- 不带参数 → 从 0 开始自动播放（仅 `ANIMATE=true` 时）

> 完整契约（合成根属性、透明输出、HUD）见 `interop.md`。

---

## 二、组件库（15 种）

类名一律 `c-` 前缀。分两组：

- **C01~C12 单元素组件** —— 一个组件说一个信息点。
- **C13~C15 关系型组件** —— 自带元素之间的排布关系。**竖版构图时优先用它们**
  （横排会被挤成窄条）。

### C01~C12 单元素

| # | 类名 | 用途 |
|---|---|---|
| C01 | `c-data` | 超大数字 + 归因标签 |
| C02 | `c-capsule` | 胶囊标签，短归因（**≤6 字**） |
| C03 | `c-kw` | 关键词大字，无容器 |
| C04 | `c-vs` | **横向**对比卡 `A ≠ B` |
| C05 | `c-quote` | 引述，竖线 + 斜体 |
| C06 | `c-rule` | 强调下划线 |
| C07 | `c-list` | 清单，逐条 |
| C08 | `c-bar` | 横向柱状条 |
| C09 | `c-ring` | 环形进度 |
| C10 | `c-line` | 折线趋势 |
| C11 | `c-step` | 步骤编号（序号 + 文字，**章节切换专用**） |
| C12 | `c-note` | 便签，补充信息 |

> **`c-vs` 是横排的**，在 1080 宽的板里会被挤成窄条。竖版对照请用 `c-cmp`。
> 同理 `c-step` 在竖版里被 `c-stack` 替代（等宽并列 → 阶梯堆叠）。

### C13~C15 关系型

| # | 类名 | 关系 | 元素数 | 用在什么时候 |
|---|---|---|---|---|
| C13 | `c-flow` | **流向**（有方向，可挂标签） | 2 块 + 1 箭头 = 3 | "A 变成 B""下沉之后到 70%" |
| C14 | `c-stack` | **递进**（宽度递减） | 层数（≤3） | "一线 15% / 二线 31% / 三线 54%" |
| C15 | `c-cmp` | **对照**（无方向） | 2 块 + 1 分隔 = 3 | "去年 / 今年""线上 / 线下" |

三者的区别（容易混）：

| | `c-flow` | `c-stack` | `c-cmp` |
|---|---|---|---|
| 有方向吗 | **有**（箭头，可挂标签） | 有（越往下越收窄） | **没有**（中缝分隔线） |
| 数量和关系 | 恰好 2 个 | 2~3 个 | 恰好 2 个 |
| 典型语义 | 转化、导致、下沉 | 分层、构成、排名 | 对照、口径差异 |

透明素材里，一个关系型组件**本身就是完整的素材点**（一组元素 + 关系），不用再拼。

### 用法示例

**C01 数据卡片**
```html
<div class="c-data">
  <div class="v"><span class="num" data-to="37" data-prefix="+" data-suffix="%" data-dur="1">+0%</span></div>
  <div class="k">同比增速 · 华东区</div>
</div>
```
`data-to` 目标值 · `data-prefix`/`data-suffix` 前后缀 · `data-dec` 小数位 · `data-dur` 滚动时长（秒）
· `data-group="1"` 加千分位（5760 → `5,760`）—— 四位数以上一律加，不加读不出来

**C02 胶囊标签**
```html
<span class="c-capsule">渠道下沉</span>
```
≤6 字。超了就是短句，不是标签（自检第 11 项会抓）。

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
一般配 2~3 行才成形 —— 那样就是 2~3 个元素。

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

**C11 步骤编号（章节切换）**
```html
<div class="c-step">
  <span class="idx">02</span>
  <span class="tx">渠道结构变化</span>
</div>
```

**C13 纵向流向**
```html
<div class="c-flow">
  <div class="st"><div class="t">一线城市</div><div class="v">40%</div></div>
  <div class="ar"><span class="rl">渠道下沉</span></div>
  <div class="st to"><div class="t">三四线</div><div class="v">70%+</div></div>
</div>
```
`.to` 标记终点块（换 `--c2` 着色）；`.ar` 里的 `.rl` 是关系标签，可省略。
箭头是纯 CSS 画的（细杆 + 三角），零外部依赖。

**C14 阶梯堆叠**
```html
<div class="c-stack">
  <div class="ly"><span class="t">三线及以下</span><span class="v">54%</span></div>
  <div class="ly"><span class="t">二线</span><span class="v">31%</span></div>
  <div class="ly"><span class="t">一线</span><span class="v">15%</span></div>
</div>
```
宽度阶梯靠 `margin-inline` 递增实现 —— 绝对定位的组件里用 `width:100%×N%` 会形成宽度循环依赖。

**C15 上下对照**
```html
<div class="c-cmp">
  <div class="side a"><span class="lb">去年</span><span class="tx">12%</span></div>
  <div class="vs">VS</div>
  <div class="side b"><span class="lb">今年</span><span class="tx">37%</span></div>
</div>
```
`.side.a` 的 `.tx` 自动加删除线并用 `--ink-soft`；`.side.b` 自动用 `--c1` 高亮。

### 组件换着用

**每 3 个组件至少换 1 种样式**。三个素材点全是 `c-cmp` 会很单调；
相邻组件换一种，整条片子换 2~3 种。

---

## 三、动效清单

**名字必须逐字精确**（模板里写死的字符串）。写错不会报错 —— 那块板只是不动。

### 入场（`data-anim`，省略则 `MASK-UP`）

| 名称 | 手感 | 适合 |
|---|---|---|
| `MASK-UP` | 从下往上擦出 | 通用，最稳 |
| `MASK-LEFT` | 从左往右擦出 | 标题、横向序列、对照 |
| `BLUR-IN` | 从模糊到清晰 | 概念浮现 |
| `SCALE-POP` | 缩放弹入，带回弹 | 数字、图表 |
| `POP-IN` | 弹性放大 | 趣味、俏皮、收尾 |
| `HARD-IN` | 快速下压，无缓动 | 强调、警告 |
| `DRAW-UNDER` | 横向拉开 | 下划线、分隔线 |
| `GROW` | 从底部纵向生长 | 柱状图 |
| `PIXEL-IN` | 阶梯式逐行显现 | pixel 风格 |
| `STAGGER-IN` | 轻微位移 + 微旋 | doodle 风格 |
| `FADE-IN` | 纯淡入 | 最克制 |
| `CALM-IN` | 极其克制的小位移 | minimal 风格 |
| `SHIFT-IN` | 从右滑入 | 补位 |

### 退场（`data-out-anim`，省略则 `FADE-SHIFT`）

| 名称 | 手感 |
|---|---|
| `FADE-SHIFT` | 淡出 + 上移（默认） |
| `SCALE-OUT` | 淡出 + 缩小 |
| `SLIDE-OUT` | 淡出 + 左移 |
| `FADE-OUT` | 纯淡出 |

退场统一 `0.4s`。

### 多样性（硬线）

- 单条产物内 **≥3 种入场动效** —— 不足直接 FAIL（三块板一个手感等于没设计）
- 模板整体 **≥4 种不同 keyframes**

**动效服务于内容**：独立成片是完整叙事，开场可以冲、主体克制、收尾干净；
透明素材是贴片、生命周期短，**入场可以更冲**（`SCALE-POP` / `POP-IN` / `HARD-IN` 一类）。

---

## 四、停留时长

**每个组件停留 ≥0.8s** —— 短于这个观众来不及读。

参考：4 个字的标签 0.8s 勉强，8 个字以上建议 ≥1.5s；
3 个元素的一块板建议 **3~5s**。
