# 组件库 · 时间轴引擎 · 动效

本技能只用 `BASE='timeline'`。组件按 `data-in / data-out` 的绝对秒数决定在场状态。

---

## 一、时间轴引擎

### 数据属性

```html
<div class="comp"
     data-in="12.4"            <!-- 入场时刻（绝对秒） -->
     data-out="16.8"           <!-- 退场时刻（绝对秒） -->
     data-anim="MASK-UP"       <!-- 入场动效 -->
     data-out-anim="SCALE-OUT"><!-- 退场动效 -->
  ...组件内容...
</div>
```

**没有 `data-safe`。** 素材是一块板，由用户自己摆，"中央"没有参照物。

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

`0.4s` 是退场动画时长，写死在运行时里，必须与 CSS `.comp.out` 的 `animation-duration` 一致。

### 运行时契约

```js
TL = { t, playing, duration, seek(s), play(), pause() }
```

**`TL` / `curScene` / `.in` 这三个名字不要改** —— 截图脚本的探针依赖它们。

### 定位

- `?t=12.4` → 跳到第 12.4 秒（静态核对 / 截图用），会暂停并冻结数字
- 不带参数 → 从 0 开始自动播放（仅 `ANIMATE=true` 时）

---

## 二、组件库（15 种）

类名一律 `c-` 前缀。分两组：

- **C01~C12 单元素组件** —— 一个组件说一个信息点。
- **C13~C15 关系型组件** —— 自带元素之间的排布关系，**为 3:4 素材而生**。

素材点的首选是**关系型组件**：它本身就是"一组元素 + 关系"，
一个 `c-flow` 就是一个完整的素材点，不用再拼。

### 关系型组件（C13~C15）—— 素材首选

| # | 类名 | 关系 | 元素数 | 用在什么时候 |
|---|---|---|---|---|
| C13 | `c-flow` | **流向**（有方向） | 2 块 + 1 箭头 = 3 | "A 变成 B""下沉之后到 70%" |
| C14 | `c-stack` | **递进**（宽度递减） | 层数（≤3） | "一线 15% / 二线 31% / 三线 54%" |
| C15 | `c-cmp` | **对照**（无方向） | 2 块 + 1 分隔 = 3 | "去年 / 今年""线上 / 线下" |

三者的区别（容易混）：

| | `c-flow` | `c-stack` | `c-cmp` |
|---|---|---|---|
| 有方向吗 | **有**（箭头，可挂标签） | 有（越往下越收窄） | **没有**（中缝分隔线） |
| 数量和关系 | 恰好 2 个 | 2~3 个 | 恰好 2 个 |
| 典型语义 | 转化、导致、下沉 | 分层、构成、排名 | 对照、口径差异 |

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
宽度阶梯靠 `margin-inline` 递增实现。
**不要改成 `width:100%×N%`** —— 在绝对定位的组件里会形成宽度循环依赖。

**C15 上下对照**
```html
<div class="c-cmp">
  <div class="side a"><span class="lb">去年</span><span class="tx">12%</span></div>
  <div class="vs">VS</div>
  <div class="side b"><span class="lb">今年</span><span class="tx">37%</span></div>
</div>
```
`.side.a` 的 `.tx` 自动加删除线并用 `--ink-soft`；`.side.b` 自动用 `--c1` 高亮。

### 单元素组件（C01~C12）

一个组件 = 一个元素。素材点里可以单用，但**更推荐配一个关系层**。

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

**C02 胶囊标签**
```html
<span class="c-capsule">渠道下沉</span>
```
≤6 字。超了就是短句，不是标签（第 11 项自检会抓）。

**C11 步骤编号（章节切换）**
```html
<div class="c-step">
  <span class="idx">02</span>
  <span class="tx">渠道结构变化</span>
</div>
```

**C01 数据卡片**
```html
<div class="c-data">
  <div class="v"><span class="num" data-to="37" data-prefix="+" data-suffix="%" data-dur="1">+0%</span></div>
  <div class="k">同比增速 · 华东区</div>
</div>
```
`data-to` 目标值 · `data-prefix`/`data-suffix` 前后缀 · `data-dec` 小数位 · `data-dur` 滚动时长（秒）

**C08 柱状条**
```html
<div class="c-bar">
  <div class="row">
    <div class="lb"><span>三线及以下</span><b>54%</b></div>
    <div class="track"><div class="fill" style="width:54%"></div></div>
  </div>
</div>
```
柱状条一般配 2~3 行才成形 —— 那样就是 2~3 个元素，正好用满预算。

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

### 不要一个卡片用到死

一段素材里**关系型组件要换着用**。三个素材点全是 `c-cmp` 会很单调。
一手经验：相邻素材点换一种组件，整条素材就换 2~3 种。

---

## 三、动效

### 入场（`data-anim`，省略则 `MASK-UP`）

| 名称 | 手感 | 素材里适用 |
|---|---|---|
| `MASK-UP` | 从下往上擦出 | 通用，最稳 |
| `MASK-LEFT` | 从左往右擦出 | 横向序列、对照 |
| `BLUR-IN` | 从模糊到清晰 | 概念"浮现" |
| `SCALE-POP` | 缩放弹入，带回弹 | 数字、图表 |
| `POP-IN` | 弹性放大 | 趣味、俏皮 |
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

### 多样性

- 单条素材内 **≥3 种入场动效**（第 9 项**硬线**，不足直接 FAIL —— 三块板一个手感等于没设计）
- 模板整体 **≥4 种不同 keyframes**（第 8 项校验）

素材是贴片，生命周期短，**入场可以更冲** —— 不要全用 `CALM-IN` 这种克制的。

---

## 四、时间轴设计规则

### 停留时长

**每个素材点停留 ≥0.8s。** 短于这个观众来不及读（第 9 项校验）。
参考：3 个元素的一块板，建议 **3~5s**。

### 与脚本对齐

时间码来自 `ivh-script` 产出的脚本 JSON。对齐规则：

- **素材点入点 = 对应句子的结束秒 + 0.2~0.4s**（数字型先听后看）
- 概念型 / 章节型可与口播同步
- **退点 = 入点 + 3~5s**（自己撑住，不跟着句子结束）

> 详细锚点规则见 `ivh-script/references/two-track-text.md`。

### 总时长

`data-duration = max(data-out)`，模板会自动写入合成根。
有外拍视频时，总时长应与视频一致，末尾留 0.5~1s 余量。

### 不要塞太满

整块板同一时刻只放**一组元素**，段与段之间留 ≥1.5s 纯透明空档。
60s 口播做 **8~12 个素材点**，不是 8~12 个组件。

---

## 五、自检

```bash
node scripts/check-template.mjs 产物.html       # 十一项，第 9/10/11 项是本技能的重点
```

**然后打开 HTML 看，不要抽帧。**

在浏览器里看是白底 —— 这是正常的，透明的地方本来就该是空的。
先点空格从头播一遍，再逐个素材点停下来看。

- [ ] 每个素材点是否**严格在其 `data-in` 之后**才出现
- [ ] 素材点的区间是否**没有重叠**（同一时刻只有一组元素）
- [ ] 相邻素材点之间是否留了 **≥1.5s 纯透明空档**
- [ ] 是否有素材点**突然消失**（说明 `data-out` 设错）
- [ ] 画布是 3:4、元素竖排、每组 **≤3 元素**，且**没有 `data-safe`**
- [ ] 每块板上**有关系层**，不是孤立的数字

> **不要靠截图判断透明。** 截图里的白，分不清是"透明"还是"白色"——
> 素材模式抽出来大半是空图，看了也说明不了任何事。
> 真透明只有出片后抽 alpha 平面才验得准（`ivh-render` 自动做）。
