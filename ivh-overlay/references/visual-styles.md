# 六风格完整规格

风格是**主观决策**，必须让用户选。这份文档是选择时的依据。

---

## 总览

| 风格 | 一句话 | 底色 | 主色 | 字体 |
|---|---|---|---|---|
| `doodle` | 手绘便签纸 | 米白纸 | 橙红 | 系统无衬线 |
| `riso` | 丝网印刷错版 | 米黄纸 | 高饱和红/蓝 | 系统无衬线 |
| `blueprint` | 工程蓝图 | 深蓝 | 天蓝 | 等宽 |
| `minimal` | 极简留白 | 纯白 | 黑/灰 | 系统无衬线 |
| `neon` | 赛博霓虹 | 近黑 | 青绿+品红 | 系统无衬线 |
| `pixel` | 像素游戏 | 深紫 | 珊瑚红/薄荷 | 等宽 |

---

## 一、doodle（默认）

**气质**：亲切、手作、口语化。像随手画的便签贴在纸上。

### 变量层

```css
:root{                        /* doodle 无预设块，即 :root 默认值 */
  --page-bg:#E8E2D6;  --paper:#F2EDE4;
  --paper-line:rgba(46,40,35,.09);  --grid:rgba(46,40,35,.055);
  --c1:#E4572E;  --c2:#17A398;  --c3:#F2B33D;
  --ink:#2E2823;  --card-bg:#FFFFFF;  --card-fill:rgba(255,255,255,.86);
  --stroke:2.5px;
  --radius:14px 6px 16px 7px / 7px 16px 6px 14px;   /* 四角不同，歪的 */
  --shadow:6px 7px 0 rgba(46,40,35,.13);
  --tilt:-0.5deg;                                   /* 轻微倾斜 */
}
```

### 结构层

- 四角圆角各不相同（`14px 6px 16px 7px / 7px 16px 6px 14px`），模拟手绘
- 硬投影（无模糊），像纸张叠起来
- `--tilt: -0.5deg` 让卡片轻微歪斜
- 纸张网格纹理

### 专属动效

`handfloat` —— 极缓慢的浮动 + 微旋（`-0.7deg` ↔ `0.5deg`）。
这个动画**始终在跑**，让画面有呼吸感。

### 适用

科普、口语化讲解、知识分享、轻松向内容。

---

## 二、riso

**气质**：潮流、年轻、观点输出。像丝网印刷的独立杂志。

### 变量层

```css
html[data-style="riso"]{
  --page-bg:#F4EFE3;  --paper:#F7F2E7;
  --c1:#FF4B3E;  --c2:#1B4C9C;  --c3:#F5C518;
  --ink:#181818;  --card-bg:#FFFDF6;  --card-fill:rgba(255,253,246,.9);
  --bar-fill:var(--c2);
  --stroke:3px;
}
```

**继承默认**：`--radius` `--shadow`

### 结构层

- 双色错版投影：`box-shadow: 5px 5px 0 var(--c1), -4px -4px 0 var(--c2)`
  —— 红蓝双向偏移，模拟套印不准
- 印刷网点纹理：`radial-gradient(rgba(0,0,0,.16) 1px, transparent 1.4px)`，
  `background-size:5px 5px`，`mix-blend-mode:multiply`
- 胶囊标签带黄色投影

### 专属动效

`hardin` —— 快速下压，无缓动。丝网印刷的"啪"一下的感觉。

### 适用

潮流内容、观点输出、品牌短片、年轻向产品。

---

## 三、blueprint

**气质**：技术、工程、严谨。像工程图纸。

### 变量层

```css
html[data-style="blueprint"]{
  --page-bg:#0B1B2B;  --paper:#0E2337;
  --paper-line:rgba(120,190,255,.16);  --grid:rgba(120,190,255,.13);
  --c1:#4FB8FF;  --c2:#9BE38A;  --c3:#FFD166;
  --ink:#DCEEFF;  --ink-soft:rgba(220,238,255,.66);
  --card-bg:#12304A;  --card-fill:rgba(18,48,74,.72);
  --stroke:2px;
  --font:var(--font-mono);          /* 等宽字体 */
}
```

**继承默认**：`--radius` `--shadow`

### 结构层

- 虚线轮廓：`border:1.5px dashed rgba(120,190,255,.55)`
- `backdrop-filter:blur(2px)` 半透明玻璃感
- 步骤编号用 CSS 计数器 `counter(bp, decimal-leading-zero)` → `01` `02` `03`
- 强调线用虚线

### 专属动效

`grow` 改为 `steps(7, end)` —— 阶梯式生长，像图纸逐段绘制。

### 透明背景反色

```css
html.bg-transparent[data-style="blueprint"]{
  --ink:#0A2237;  --card-fill:rgba(255,255,255,.92);
  --paper-line:rgba(10,34,55,.18);
}
```

深蓝底没有时，浅蓝字会消失，所以转为深字浅底。

### 适用

技术架构讲解、工程汇报、代码相关、开源项目介绍。

---

## 四、minimal

**气质**：克制、专业、数据为主。没有装饰，只有信息。

### 变量层

```css
html[data-style="minimal"]{
  --page-bg:#FBFBFA;  --paper:#FFFFFF;
  --paper-line:rgba(0,0,0,.07);  --grid:transparent;   /* 无网格 */
  --c1:#111111;  --c2:#8A8A8A;  --c3:#C8C8C8;
  --ink:#141414;  --card-bg:#FFFFFF;  --card-fill:rgba(255,255,255,.96);
  --stroke:1.5px;  --radius:4px;  --shadow:none;  --tilt:0deg;
}
```

### 结构层

- 发丝边框：`1px solid rgba(0,0,0,.1)`
- 直角（`border-radius:0`）
- **无阴影**（`--shadow:none`）
- 分隔线用 `border-top:1px solid`
- 引述用左侧竖线

### 专属动效

`calmin` —— 位移只有 10px，缓慢优雅。适合商务场景。

### 适用

商务汇报、数据分析、企业宣传、正式场合。

---

## 五、neon

**气质**：科技、赛博、发布会。深色背景 + 霓虹发光。

### 变量层

```css
html[data-style="neon"]{
  --page-bg:#07070E;  --paper:#0B0B16;
  --paper-line:rgba(140,120,255,.14);  --grid:rgba(140,120,255,.09);
  --c1:#00F5D4;  --c2:#FF3D9A;  --c3:#FFE45E;
  --ink:#EAF6FF;  --card-bg:#101024;  --card-fill:rgba(16,16,36,.78);
  --stroke:2px;  --radius:2px;
  --shadow:0 0 26px rgba(0,245,212,.28);
  --glow:0 0 18px currentColor;
}
```

### 结构层

- **切角面板**：`clip-path:polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)`
  —— 左上和右下切掉一角，科技感
- 发光：`box-shadow` 带颜色，`text-shadow` 走 `--glow`
- 扫描线纹理：`repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px)`

### 专属动效

`blurin` 略快（0.62s），配合发光的"点亮"感。

### 透明背景反色

```css
html.bg-transparent[data-style="neon"]{
  --ink:#101322;  --card-fill:rgba(255,255,255,.9);
  --c1:#00B8A9;  --c2:#D62A7E;       /* 降饱和，避免叠在实拍上太刺眼 */
  --glow:none;                        /* 发光关掉 */
}
```

### 适用

产品发布会、科技评测、赛博主题、游戏宣传。

---

## 六、pixel

**气质**：复古、游戏、趣味。像 8-bit 游戏画面。

### 变量层

```css
html[data-style="pixel"]{
  --page-bg:#1A1428;  --paper:#221A33;
  --paper-line:rgba(255,255,255,.08);  --grid:rgba(255,255,255,.05);
  --c1:#FF6B6B;  --c2:#4ECDC4;  --c3:#FFE66D;
  --ink:#F7F3FF;  --card-bg:#2B2140;  --card-fill:rgba(43,33,64,.86);
  --stroke:4px;  --radius:0px;
  --shadow:6px 6px 0 rgba(0,0,0,.45);
  --font:var(--font-mono);
}
```

### 结构层

- **粗边框** `4px`，**直角** `border-radius:0`
- 硬投影 `6px 6px 0`，无模糊
- `shape-rendering:crispEdges` 保证边缘不抗锯齿
- 扫描线 + 暗角

### 专属动效

`pixelin` —— `steps(4, end)`，逐行显现，模拟像素缓冲刷新。
`maskup` 也改为 `steps(4, end)`，跳帧感。

### 透明背景反色

```css
html.bg-transparent[data-style="pixel"]{
  --ink:#171229;  --card-fill:rgba(255,255,255,.92);
  --paper-line:rgba(23,18,41,.18);
}
```

### 适用

复古游戏、二次元、趣味科普、年轻社区。

---

## 风格差异自检

### 校验风格没写坏（必跑，纯文本）

```bash
node scripts/check-template.mjs 产物.html       # 第 8 项：量化风格差异
```

第 8 项会给出量化结果：属性数、能力维命中数、结构指纹组合数。差异不够明显会被拦下。

### 让用户挑风格（可选，一次性）

交付前问用户选风格时，如果对方不知道六个名字各长什么样，
可以生成一张对照页给他挑：

```bash
node ../ivh-render/scripts/shoot.mjs 产物.html --gallery   # 六风格对照页（6 张截图）
```

`shoot.mjs` 属渲染技能，本技能目录里没有，必须从 `ivh-render` 调。

**这是"帮用户做选择"的一次性工具，不是每次交付的检查步骤。**
对照页生成后确认：底色、外形（圆角/切角/直角/虚线）、纹理（网格/网点/扫描线/无）
三者在六个风格之间是否明显不同。

---

## 新增风格的方法

1. 在**区块 3-A** 加变量覆写块
2. 在**区块 3-B** 加结构覆写（至少 4 条规则，覆盖外形/纹理/排版）
3. 若为深色风格，在**区块 8** 加透明反色降级块
4. 可选：在**区块 7** 加专属动效覆写
5. 跑 `check-template.mjs`，确认第 3/4/8 项通过

**不要修改 `:root`** —— 那是 doodle 的值，改它会污染所有风格。
