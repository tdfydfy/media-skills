---
name: ivh-overlay
description: 信息图视频流水线第 3 环——透明素材。读脚本技能产出的文字脚本，生成 3:4 竖版透明素材单文件 HTML：一串稀疏的强调贴片（章节 / 关键概念 / 数字图表），渲染成带 alpha 的 mov 后由用户叠加到实拍视频上。当用户说"做透明素材""要叠加素材""生成 B-roll 贴片""做透明底的强调动画"时使用。
agent_created: true
---

# 透明素材（信息图视频 · 第 3 环）

**只干一件事：文字脚本 → 3:4 透明素材单文件 HTML。**

```
ivh-script-overlay ──→ 脚本.json ──→ [ 你在这里 ] ──→ 素材.html ──→ ivh-render ──→ .mov (alpha)
```

产物是**一条跟时间轴走的稀疏层**：成片里大段是全透明的，只在值得强调的地方浮出一块板。
**这是设计，不是 bug。**

**闸门 2 / 2 在本技能。** `素材.html` 出来之后：跑校验 → `present_files` 递出去 → **本轮结束**。
等用户看过说"可以"，出片才轮到 `ivh-render`。
用户一次性要的是最终视频，也照停 —— 闸门是分工：字没定，排版就是白排。

---

## 一、开始前先确认

**输入**：`ivh-script-overlay` 产出的脚本 JSON（`purpose: "overlay"`）。
没有脚本？先回 `ivh-script-overlay` 写脚本，不要在这里现编内容。

**开工前先验章（只读，不盖章）：**

```bash
node ../ivh-script-core/scripts/check-script.mjs 脚本.json
```

`meta.check` 缺失、或指纹与当前内容不符 → **拒收，退回 `ivh-script-overlay`**。
这两处都是一眼看出来的错，但不查就会变成下游一批没法改的返工。

**必须先问用户**（不要套默认值）：

1. **风格（STYLE）** —— 六选一，见 `../ivh-html-core/visual-styles.md`
   `doodle` 手绘 / `riso` 印刷套色 / `blueprint` 工程蓝图 / `minimal` 极简 / `neon` 霓虹 / `pixel` 像素
2. **口播视频的画幅与主体位置** —— 决定素材摆哪儿（但**不影响画布**，画布恒为 3:4）

**不用问的**：比例恒为 **3:4**、背景恒为透明、底座恒为时间轴。这三项是本技能的定义。

---

## 二、四步走

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

一个素材点 **≤3 个元素 / ≤2 组关系**，首选关系型组件（`c-flow` / `c-stack` / `c-cmp`），
它本身就是"一组元素 + 关系"。**孤立的数字没有意义** —— 必须有对照 / 流向 / 构成。

几何、竖排约束、图像三手法见 `references/material-spec.md`。

### 第 3 步 · 排时间轴

- 素材点入点 = 对应句子的**结束秒 + 0.2~0.4s**（数字先听后看）
- 退点 = 入点 + **3~5s**（自己撑住，不跟着句子结束）
- **素材点之间不得重叠** —— 一块板同一时刻只有一组元素
- **相邻素材点留 ≥1.5s 纯透明空档** —— 让实拍主体露出来

### 第 4 步 · 自检 → 递给用户 → 停

```bash
node scripts/check-template.mjs 素材.html      # 十二项自检，纯文本，秒级
```

**闸门 2 / 2 —— HTML 效果确认。** 校验器管"结构对不对"（纯文本，必跑），
用户看 HTML 管"效果好不好"（人眼，不要代劳）。所以这一步的动作是固定的三步：

1. 跑上面的校验，过了才交
2. `present_files` 打开 `素材.html`
3. **本轮到此结束** —— 出片是下一环的活，等用户说"可以"再进 `ivh-render`

透明素材在浏览器里看是白底，透明的地方本来就该是空的。用户要看的是**每块板的内容与动效**，
以及"块与块之间是不是真的空着"。透明区对不对，截图里的白分不清是"透明"还是"白色"，
唯一可信的判据是出片后抽 alpha 平面（`ivh-render` 会自动做）。

---

## 三、出片：交给 `ivh-render`

用户看过 HTML 说没问题之后：

```bash
node ../ivh-render/scripts/render.mjs 素材.html    # → ProRes 4444 .mov (alpha)
```

叠在实拍上的最终效果，要在剪映 / PR 里合完才知道 —— 那是用户的活，不是你的。

---

## 四、模板怎么用

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

## 五、硬约束

**形态定义**（`check-template.mjs` 会拦）：CONFIG 四项锁死 `overlay` / `timeline` / `transparent` / `3:4`、
`HIDE_HUD: true`、单文件零依赖。

**来自脚本的约束**：素材点不重叠、相邻空档 ≥1.5s、每组元素 ≤3、停留 ≥0.8s、标签 ≤6 字。
这些在脚本层已经定死，照脚本做即可，不要重新发明时间。

---

## 六、文件

| 路径 | 用途 |
|---|---|
| `assets/template.html` | 3:4 素材模板：六风格 + 15 组件 + 时间轴引擎 |
| `scripts/check-template.mjs` | **十二项自检**，交付前必跑 |
| `scripts/make-fixture.mjs` | 造 good / bad 素材样例，用于回归自测 |
| `scripts/selftest-check.mjs` | 校验脚本自身的正反双向自测（维护用） |
| `references/material-spec.md` | **素材规格**：3:4 单板几何、时间轴规则、图像三手法、动效选择 |
| `../ivh-html-core/components.md` | **组件库（15 种）与动效清单**（共享层，唯一副本） |
| `../ivh-html-core/visual-styles.md` | 六风格完整规格（变量层 / 结构层 / 动画层） |
| `../ivh-html-core/interop.md` | **产物契约**：与 `ivh-render` 共用的属性与运行时名字 |

---

## 七、边界

**一句话**：一块 3:4 的板，一组有关系的元素，一段 3~5 秒的强调，块与块之间留出透明的呼吸。
内容来自 `ivh-script-overlay`，出片交给 `ivh-render`。
