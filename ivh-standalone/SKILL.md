---
name: ivh-standalone
description: 信息图视频流水线第 2 环——独立视频。读脚本技能产出的文字脚本，用"讲故事 + PPT"的逻辑做一个完整、连贯的单文件 HTML：A-roll 主张（标题大字或生成素材）+ B-roll 证据（数据/图表），整屏多幕推进。当用户说"做独立视频""把这个脚本做成完整视频""生成一版信息图动画片""HTML 动画演示"时使用。
agent_created: true
---

# 独立视频（信息图视频 · 第 2 环）

**只干一件事：文字脚本 → 整屏多幕、连贯叙事的单文件 HTML。**

```
ivh-script ──→ 脚本.json ──→ [ 你在这里 ] ──→ 成片.html ──→ ivh-render ──→ .mp4
```

与透明素材（`ivh-overlay`）的分水岭：**独立成片自己扛叙事**，A 开头 A 收尾，整屏推进。

---

## 一、开始前先确认

**输入**：`ivh-script` 产出的脚本 JSON（`purpose: "standalone"`）。
没有脚本？先回 `ivh-script` 写脚本，不要在这里现编内容。

**必须先问用户**（不要套默认值）：

1. **画幅（RATIO）** —— `16:9` 横屏 / `9:16` 竖屏 / `4:3` / `3:4`
2. **风格（STYLE）** —— 六选一，见 `references/visual-styles.md`
   `doodle` 手绘 / `riso` 印刷套色 / `blueprint` 工程蓝图 / `minimal` 极简 / `neon` 霓虹 / `pixel` 像素
3. **A-roll 用什么** —— 文字标题 / 生成素材（图像或视频）。由内容定，不锁死

**不用问的**：`PURPOSE` 恒为 `standalone`，背景通常 `opaque`（有纸张/网格底纹）。

---

## 二、三幕骨架

| 幕 | 作用 | 占比 | A/B |
|---|---|---|---|
| **开场** | 立住问题 / 抛出结论 | ~15% | 只用 A |
| **主体** | 展开论证，2~5 个意群 | ~70% | A + B 同屏 |
| **收尾** | 收束成一句可记住的话 | ~15% | 只用 A |

每个意群都是 **A+B 单元**：A 说要什么（主张），B 拿数据证明（证据）。

**自检法**：把每个 A-roll 抄下来连成一段话 —— 读得通，骨架就立住了。

详见 `references/narrative-structure.md`。

---

## 三、A-roll / B-roll 分带

用 `data-roll` 把一屏分成上下两带，**模板自动落位，不用写坐标**：

| 轨道 | `data-roll` | 内容 | 落点 |
|---|---|---|---|
| **A-roll** | `A` | 主张：标题大字 / 生成素材 | 上半带 |
| **B-roll** | `B` | 证据：数据 / 图表 / 清单 | 下半带 |

- 一屏最多 **A+B 两条**，多了会乱
- **B 比 A 晚 0.4~0.8s 入场** —— 先读主张，再看证据
- 同场共存的组件**必须写 `data-roll`**，否则两条都居中会叠在一起

---

## 四、两种排版路径

| `BASE` | 结构 | 何时用 |
|---|---|---|
| `text` | 一幕一屏（`.scene`，`data-sec` 定时） | 无逐字稿 / 无严格时间码 |
| `timeline` | 组件卡点（`.comp`，`data-in/out`） | 有脚本时间码，要卡点 |

两条路径**不要混用**。骨架（三幕 / A-B 分轨）两者相同。

---

## 五、模板怎么用

复制 `assets/template.html`，改 `<script>` 里的 CONFIG：

```js
const CONFIG = {
  PURPOSE : 'standalone',    // 锁定
  BASE    : 'text',          // text 分幕 | timeline 组件卡点
  BG      : 'opaque',        // 通常带底纹；整屏透明叠加是边缘用法（改 transparent），贴片请用 ivh-overlay
  RATIO   : '16:9',          // ← 第 1 步问用户
  STYLE   : 'doodle',        // ← 第 1 步问用户，六选一
  ANIMATE : true,            // 出片必须 true
  AUTOPLAY: true,            // BASE=text 时自动轮播
  HIDE_HUD: true             // 导出前 true（藏 #hud / #kbd / #bar）
};
```

然后把 `#stage` 的内容换成真实的幕或组件：

```html
<!-- BASE=text：一幕一屏 -->
<section class="scene active" data-sec="6">
  <div class="h1 anim">渠道下沉<br>带来<span class="hl">结构性</span>增长</div>
</section>

<!-- BASE=timeline：A/B 分带 -->
<div class="comp" data-in="5.6" data-out="13.4" data-roll="A" data-anim="MASK-LEFT">
  <div class="h2">三线城市<span class="hl2">贡献过半</span></div>
</div>
<div class="comp" data-in="6.2" data-out="13.4" data-roll="B" data-anim="MASK-UP">
  <div class="c-bar">...</div>
</div>
```

---

## 六、硬约束（自检会拦）

| 约束 | 判据 |
|---|---|
| 单文件零依赖 | 无 http 引用、无外链、无 `@import` |
| 幕有 `data-sec` | 每幕都要（第 10 项） |
| 幕停留 3~12s | 太短赶、太长拖 |
| 组件停留 ≥0.8s | 第 9 项 |
| 组件换着用 | 至少 3 种（第 10 项 note） |
| 同场组件写 `data-roll` | 否则会叠位 |
| 入场动效 ≥3 种 | 第 9 项**硬线**，不足直接 FAIL |
| 提示标签 ≤6 字 | 第 11 项 |

---

## 七、交付：校验过，然后让用户看 HTML

```bash
node scripts/check-template.mjs 成片.html      # 十一项，纯文本，秒级
```

**然后直接把 HTML 交给用户**（`present_files` 打开），**不要抽帧自己看**。

```bash
# ❌ 不要这样做 —— 抽帧不是检查手段（它是出片的生产方式本身），观感判断交给用户
node ../ivh-render/scripts/shoot.mjs 成片.html --step 3
```

HTML 本身就是可运行、可交互、可反复回看的：模板带 `AUTOPLAY`，打开就是完整节奏；
空格暂停、点页码跳幕。**用户看到的信息量比几张定格截图大得多，而成本是 0。**

用户说没问题 → 交给 `ivh-render` 出片；有问题 → 改，再给用户看一次。

> **闸门 2 / 3 —— HTML 效果确认。**
> `check-template.mjs` 管"结构对不对"（纯文本，必跑）；
> 用户看 HTML 管"效果好不好"（人眼，不要代劳）。
> 你自己抽帧属于重复劳动：既不比用户看得准，还慢。

> `shoot-at.mjs` 只在一种情况下用：**用户明确要求**核对某个时间点的卡点。
> 它是有针对性的复核工具，不是常规流程的一步。

---

## 八、文件

| 路径 | 用途 |
|---|---|
| `assets/template.html` | 独立成片模板：幕引擎 + 时间轴 + A/B 分带 + 六风格 + 15 组件 |
| `scripts/check-template.mjs` | **十一项自检**，交付前必跑 |
| `scripts/make-fixture.mjs` | 造 scene/timeline 的 good/bad 样例，用于回归自测 |
| `scripts/selftest-check.mjs` | 校验脚本自身的正反双向自测（维护用） |
| `references/narrative-structure.md` | **叙事结构**：三幕骨架、A/B 分轨规划、密度、连贯手法 |
| `references/components.md` | 幕与组件库、A/B 分带、动效、时间轴规则 |
| `references/layout-and-constraints.md` | 四种比例、安全边距、定位规则、硬约束 |
| `references/visual-styles.md` | 六风格完整规格（变量层 / 结构层 / 动画层） |
| `references/interop.md` | **产物契约**：与 `ivh-render` 共用的属性与运行时名字 |

---

## 九、边界

- ❌ 不写脚本 —— 内容来自 `ivh-script`，这里只做视觉化与装配
- ❌ 不做透明贴片 —— 那是 `ivh-overlay`。本技能的输出是**整屏**内容
- ❌ 不做逐句卡点之外的剪辑 —— 成片交给 `ivh-render`
- ❌ 不引外部资源 —— 单文件铁律，生成素材必须内联（`data:` URI 或内联 SVG）
