---
name: ivh-overlay
description: 信息图视频流水线第 3 环——透明素材。读脚本技能产出的文字脚本，生成 3:4 竖版透明素材单文件 HTML：一串稀疏的强调贴片（章节 / 关键概念 / 数字图表），渲染成带 alpha 的 mov 后由用户叠加到实拍视频上。当用户说"做透明素材""要叠加素材""生成 B-roll 贴片""做透明底的强调动画"时使用。
agent_created: true
---

# 透明素材（信息图视频 · 第 3 环）

**只干一件事：文字脚本 → 3:4 透明素材单文件 HTML。**

```
ivh-script ──→ 脚本.json ──→ [ 你在这里 ] ──→ 素材.html ──→ ivh-render ──→ .mov (alpha)
```

产物是**一条跟时间轴走的稀疏层**：成片里大段是全透明的，只在值得强调的地方浮出一块板。
**这是设计，不是 bug。**

---

## 一、开始前先确认

**输入**：`ivh-script` 产出的脚本 JSON（`purpose: "overlay"`）。
没有脚本？先回 `ivh-script` 写脚本，不要在这里现编内容。

**必须先问用户**（不要套默认值）：

1. **风格（STYLE）** —— 六选一，见 `references/visual-styles.md`
   `doodle` 手绘 / `riso` 印刷套色 / `blueprint` 工程蓝图 / `minimal` 极简 / `neon` 霓虹 / `pixel` 像素
2. **口播视频的画幅与主体位置** —— 决定素材摆哪儿（但**不影响画布**，画布恒为 3:4）

**不用问的**：比例恒为 **3:4**、背景恒为透明、底座恒为时间轴。这三项是本技能的定义。

---

## 二、五步走

### 第 1 步 · 读脚本，挑出素材点

脚本里每条 `overlay` 类型的素材点 = 一块板。**只挑这四类**：

| 类型 | 素材形态 |
|---|---|
| 章节切换 | 序号 + 标题（`c-step` / `c-capsule`） |
| 关键概念 | 词 + 释义（`c-kw` / `c-quote`） |
| 数字 / 表格数据 | 关系型组件（`c-flow` / `c-stack` / `c-cmp`） |
| 图像 | 图 + 标注层（聚光 / 圈选 / 引线） |

**密度参考**：60s 口播 → **8~12 个素材点**。平均每 5~7 秒一个。

### 第 2 步 · 一块板 = 一组元素 + 关系

一个素材点 **≤3 个元素 / ≤2 组关系**。首选**关系型组件** ——
它本身就是"一组元素 + 关系"，一个组件就是一个完整的素材点。

```
┌──────────────┐
│  一线城市 40% │
│      ↓        │  ← 关系层：渠道下沉
│  三四线 70%+  │
└──────────────┘
```

**孤立的数字没有意义。** 必须有对照 / 流向 / 构成。

### 第 3 步 · 排时间轴

- 素材点入点 = 对应句子的**结束秒 + 0.2~0.4s**（数字先听后看）
- 退点 = 入点 + **3~5s**（自己撑住，不跟着句子结束）
- **素材点之间不得重叠** —— 一块板同一时刻只有一组元素
- **相邻素材点留 ≥1.5s 纯透明空档** —— 让实拍主体露出来

### 第 4 步 · 自检 + 交给用户看

```bash
node scripts/check-template.mjs 素材.html      # 十一项自检，纯文本，秒级
```

然后**直接把 HTML 交给用户**（`present_files` 打开），**不要抽帧自己看**。

透明素材在浏览器里看是白底 —— 这是正常的，透明的地方本来就该是空的。
用户要看的是**每块板的内容与动效**，以及"块与块之间是不是真的空着"。

```bash
# ❌ 不要这样做 —— 每帧拉起一次浏览器，而且素材大半是空档，抽出来一堆白图
node ../ivh-render/scripts/shoot.mjs 素材.html --points
```

靠抽帧判断"透明区对不对"本来就不靠谱：**截图里的白，分不清是"透明"还是"白色"**。
真要验证透明，唯一可信的判据是出片后抽 alpha 平面（`ivh-render` 会自动做）。

> **闸门 2 / 3 —— HTML 效果确认。**
> 校验脚本管"结构对不对"（纯文本，必跑），用户看 HTML 管"效果好不好"（人眼，不要代劳）。

### 第 5 步 · 交给下游出片

用户说没问题之后再出片：

```bash
node ../ivh-render/scripts/render.mjs 素材.html    # → ProRes 4444 .mov (alpha)
```

叠在实拍上的最终效果，要在剪映 / PR 里合完才知道 —— 那是用户的活，不是你的。

---

## 三、模板怎么用

复制 `assets/template.html`，改 `<script>` 里的 CONFIG：

```js
const CONFIG = {
  PURPOSE : 'overlay',       // 锁定
  BASE    : 'timeline',      // 锁定
  BG      : 'transparent',   // 锁定
  RATIO   : '3:4',           // 锁定 —— 1080x1440 一块板
  STYLE   : 'minimal',       // ← 第 1 步问用户，六选一
  ANIMATE : true,            // 出片必须 true
  HIDE_HUD: true             // 透明产物必须 true（藏 #hud / #kbd / #bar 三件套）
};
```

然后把 `#stage` 里的 `.tl-track` 换成真实素材点：

```html
<div class="comp" data-in="12.4" data-out="16.8" data-anim="MASK-UP">
  <div class="c-flow">
    <div class="st"><div class="t">一线城市</div><div class="v">40%</div></div>
    <div class="ar"><span class="rl">渠道下沉</span></div>
    <div class="st to"><div class="t">三四线</div><div class="v">70%+</div></div>
  </div>
</div>
```

**不写 `data-safe`。** 板由用户自己摆，"中央"没有参照物。

---

## 四、硬约束（自检会拦）

| 约束 | 判据 |
|---|---|
| CONFIG 四项锁死 | `overlay` / `timeline` / `transparent` / `3:4` |
| `HIDE_HUD` 为 `true` | 否则底部会留一条彩色进度条 |
| 素材点不重叠 | 同一时刻只有一组元素 |
| 相邻空档 ≥1.5s | 纯透明，不是退场动画刚开始 |
| 每组元素 ≤3 | 超了拆成两个素材点 |
| 停留 ≥0.8s | 短了来不及读 |
| 提示标签 ≤6 字 | 超了就是短句，不是标签 |
| 单文件零依赖 | 无 http 引用、无外链 |

---

## 五、文件

| 路径 | 用途 |
|---|---|
| `assets/template.html` | 3:4 素材模板：六风格 + 15 组件 + 时间轴引擎 |
| `scripts/check-template.mjs` | **十一项自检**，交付前必跑 |
| `scripts/make-fixture.mjs` | 造 good / bad 素材样例，用于回归自测 |
| `scripts/selftest-check.mjs` | 校验脚本自身的正反双向自测（维护用） |
| `references/material-spec.md` | **素材规格**：3:4 单板、稀疏密度、关系层、两条硬规则 |
| `references/components.md` | 时间轴引擎、15 组件、动效、时间轴设计规则 |
| `references/visual-styles.md` | 六风格完整规格（变量层 / 结构层 / 动画层） |
| `references/interop.md` | **产物契约**：与 `ivh-render` 共用的属性与运行时名字 |

---

## 六、边界

- ❌ 不写脚本 —— 内容来自 `ivh-script`，这里只做视觉化
- ❌ 不做整屏满铺 —— 那是 `ivh-standalone`。本技能只出"一块板"
- ❌ 不做连贯叙事 —— 素材块间是**跳跃**的，靠透明空档隔开
- ❌ 不渲染视频 —— 交给 `ivh-render`

**一句话**：一块 3:4 的板，一组有关系的元素，一段 3~5 秒的强调，块与块之间留出透明的呼吸。
