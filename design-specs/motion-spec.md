# 动效规范 · Motion Spec

> **这是十六格里 09 / 13 / 15 / 16 四格的公共层。**
> 四格里凡**不随风格变化**的部分写在本文（定格机制能表达什么、交错与转场怎么写、动效的抽帧成本）；
> 随风格变化的部分（本套的时长档、曲线、入场语汇、专属 keyframes）留在各套的 `design-spec.md`。
> 起草依据：《Vibe Coding 网页动效词典》（[上篇](https://waytoagi.feishu.cn/wiki/OuhQwmvi0iNmOpkXHv2c6gUanzc) ·
> [中篇](https://waytoagi.feishu.cn/wiki/ZIQywxL8giinObkF3x0cfd8Unwd)）对照 `ivh-html-core/components.md`
> 与两份 `assets/template.html` 的运行时；结论均带实测证据。论证过程见仓库根的 `动效词典与本流水线的结合分析.md`。

---

## 0 两层怎么分工

| | 写在哪 | 回答什么 | 例子 |
|---|---|---|---|
| **公共层**（本文） | `design-specs/motion-spec.md` | **能做什么、怎么写、多贵** | 交错靠子元素 delay；曲线必须写成 `cubic-bezier`；一片板最多一个滤镜动画 |
| **风格层**（每套） | `<套名>-design/design-spec.md` 09 / 13 / 15 / 16 格 | **在本套语言里取什么值** | 柔面凸凹：时长 240/360/480ms、位移 ≤4px、背景静止 |

判据还是那一条：**能直接抄成 CSS 才算写完。** 公共层给的是"能抄"，风格层给的是"抄哪一组值"。

---

## 1 三条机制约束 —— 决定什么能进产物

词典是给**活的网页**写的，本流水线是**定格抽帧**。这一条边界筛掉了词典里大半词条。

### 1.1 只有「时间 → 属性」能定格，「输入 → 属性」没有输入源

`template.html` 的 `freezeCompAnims()` 用「负 `animation-delay` + `animationPlayState:'paused'`」把画面定在第 `off` 秒。
所以能被采集的动效**只有一种形态：CSS 关键帧 + delay**。

- 靠 `requestAnimationFrame` / `performance.now()` / `scrollY` / 指针坐标算出来的效果，逐帧取样时要么不动、要么随机。
- 模板自带的 `.num` 计数器就是这条的现场证据：它走 rAF，被 `freezeCounters()` 直接写成终值 —— 成片里从头到尾都是终值。**任何会变的数字必须做成 CSS 动画**（写法见各套 16 格）。

**一条规则代替一份黑名单**：
- ✅ 触发源是**时间轴**（`data-in` / `data-out`）或**循环相位**的，全部成立；
- ❌ 触发源是**实时光标 / 滚动位置 / 拖拽**的，一律没有输入源 —— 除非将来造一个「伪光标」组件（位置写成关键帧，机制上可行），那属于"教人做网页"这类题材的专属资产。

顺带一条与分幕有关的：分幕模式（`BASE=text`）下 `.anim` 类目前**没有任何 CSS 规则命中**，入场触发只认 `body.animate .comp.in[data-anim]`。所以「一屏一幕 + 入场动效」这种讲法目前只能走 `timeline`。

### 1.2 子元素各自的 delay 已被读到 —— 交错是零成本的

同一函数遍历的是 `[c, ...c.querySelectorAll('*')]`，**每个元素读自己的 computed `animation-delay`**：

```js
if (!ANIM_D0.has(el)) ANIM_D0.set(el, parseFloat(cs.animationDelay) || 0);
el.style.animationDelay = (ANIM_D0.get(el) - off) + 's';
```

实测（三个子元素 delay 分别 0 / 0.15 / 0.30s，同一 `off` 下）：

| off | 子元素 1 | 子元素 2 | 子元素 3 |
|---|---|---|---|
| 0.10 | y=4.19 / op=0.948 | y=10.50 / op=0.869 | y=25.82 / op=0.677 |
| 0.20 | y=0.97 / op=0.988 | y=5.74 / op=0.928 | y=14.15 / op=0.823 |
| 0.30 | y=0.34 / op=0.996 | y=3.03 / op=0.962 | y=7.78 / op=0.903 |

三个元素在同一帧停在三种进度上，随 `off` 单调推进。
**结论：交错、逐行、逐词显现都只需要写 CSS，运行时一行不用改。**

> ⚠️ 隐性成本：`off === 0` 那一帧必须走「先 `animation:'none'` → 读一次 `offsetWidth` 强制重排 → 再挂回去」这条重挂路径，否则停在随机墙上时间上（实测转出 150°，正确值是 0°）。子元素动画上线后每个元素一次重排 —— 一块板 30 个子元素就是 30 次。

### 1.3 循环类动效也能定格，相位是干净取模

`animation-iteration-count: infinite` 的元素，在负 delay + paused 下相位精确等于 `(off mod duration) / duration`：

| off 差 | 期望转角 | 实测转角 |
|---|---|---|
| 0.1s | +36° | +36° |
| 0.35s | +126° | +126° |
| 1.45s | +522° → 模 360 = 162° | +162° |

→ 跑马灯、循环背景、持续旋转可以进产物。**唯一的自我约束：首尾帧必须等于元素的基础态** —— 相位计算本身不看关键帧内容，0% 帧与静止态不一致，就会每循环一圈跳一下。

---

## 2 四条编排通道

按性价比排序。前三条是**目前缺的能力**，第四条是**目前写得最浅的**。

### ① 子元素交错 Stagger

**现状**：`STAGGER-IN` 是假交错 —— `@keyframes staggerin` 只做「位移 + 微旋」，没有任何错开。真交错只存在于 doodle 风格里写死的两档（`nth-child(2)/(3)` → 0.5s / 1s）。

**写法**（新增 `data-stg`，单位为秒，0 表示不交错）：

```css
body.animate .comp.in[data-stg] > * {
  animation: maskup .62s cubic-bezier(.22,.85,.28,1) both;
  animation-delay: calc(var(--stg) * var(--i, 0));
}
body.animate .comp.in[data-stg] > *:nth-child(1){--i:0}
body.animate .comp.in[data-stg] > *:nth-child(2){--i:1}
/* …写到 nth-child(8) 即可 —— 超过 8 个子元素说明这块板该拆了 */
```

**参数**：`--stg` 取 0.05~0.08s；**整组总延迟 ≤0.3s**。超过 300ms 就从"连贯"变成"排队等候"。
受益最大的是 `c-list` / `c-bar` / `c-ring` / `c-line` / `c-stack` 这类多元素组件。

**成本**：CSS 约 12 行 + 契约加一个属性，运行时零改动。

### ② 文字分级显现 Line / Word reveal

**现状**：13 种入场全部挂在 `.comp` 上，文字动效 = 整个组件一起擦出。标题和正文**同一个手感、同一个时刻** —— 这正是"三块板一个手感"在单块板内部的缩影。

**写法**：

```html
<h1 class="line-reveal"><span><i>第一行</i></span><span><i>第二行</i></span></h1>
```
```css
.line-reveal > span{display:block;overflow:hidden}
.line-reveal > span > i{display:block;font-style:normal;
  animation:linerise .58s cubic-bezier(.22,.85,.28,1) both;
  animation-delay:calc(var(--stg,.07) * var(--i,0))}
@keyframes linerise{from{transform:translateY(115%)} to{transform:none}}
```

**两条边界**：
- **只给主标题、章节标题、引言用**；正文与字幕保持整块清晰 —— 逐字播放会拖慢阅读。
- 汉字没有空格，**Word reveal 要按语义切短语**，不交给模型自由分词。

**成本**：CSS 约 15 行；主要工作量在生成器要按行/短语包 `<span>`。

### ③ 章节转场 Wipe

**现状**：幕与幕之间是硬切。全片唯一的转场手段是"旧组件退场 + 新组件入场"，两块板一重叠就互相打架。
**关键差别**：转场要由**一个全屏层**承担切换，不让内容自己切换。

```html
<div class="wipe" style="--wipe-at:12.6; --wipe-dur:.8"></div>
```
```css
.wipe{position:absolute;inset:0;background:var(--ink);z-index:99;clip-path:inset(0 100% 0 0)}
@keyframes wipe{0%{clip-path:inset(0 100% 0 0)} 45%{clip-path:inset(0 0 0 0)}
                55%{clip-path:inset(0 0 0 0)} 100%{clip-path:inset(0 0 0 100%)}}
```

**待裁决**：转场归**幕**还是归**全局时间轴**？（见 §6）

### ④ 在场演化 —— 各套 16 格的主题

入场 → **完全静止** → 退场，是本流水线最像 PPT 的地方：一块板停 5 秒，后 4 秒是死帧。
词典给的答案是 `Scroll-linked`（进度绑一个连续量）—— 视频里的连续量就是 `t`。§1.1 的负 delay 机制天然支持：**把关键帧时长拉长到覆盖整个停留区间，它就成了一条可拖动的进度条**。

公共层只规定三件事，具体动作写在各套的 16 格：

| 公共规定 | 说明 |
|---|---|
| 时长 = 停留区间，不是 0.6s | 例：在场 6 秒的进度条 → `animation: grow 6s linear both` |
| 一个元素只挂一个动画 | 定格函数读的是 `animationDelay` 的第一个值，`animation:A, B` 会让第二条时间轴失控；要叠加就拆父子两层 |
| 新动画名**逐字**注册 | 名字不认识时**不报错**，那块板只是不动，而「≥3 种入场」照样判通过 —— 校验器抓不到 |

可直接搬的四个动作：**Sticky scrollytelling**（固定主视觉 + 内容依次替换）、**Progress indicator**（全局章节进度）、**Parallax / Scroll zoom**（给平面叠层加景深推拉）、**Scramble text**（数字先乱码跳动再落定，比 `SCALE-POP` 更有"数据来了"的感觉）。

---

## 3 与词典 36 条的映射

### 已有对应（6 个，不用动）

| 词典词条 | 本流水线 |
|---|---|
| 6 Fade in / out | `FADE-IN` / `FADE-OUT` |
| 8 Slide in / out | `MASK-UP` / `MASK-LEFT` / `SHIFT-IN` / `SLIDE-OUT` |
| 9 Scale in / out | `SCALE-POP` / `POP-IN` / `SCALE-OUT` |
| 10 Blur reveal | `BLUR-IN` |
| 11 Clip-path reveal | `MASK-UP` / `MASK-LEFT` 本质就是 `clip-path: inset()` 擦出 |
| 5 Spring | `SCALE-POP` / `POP-IN` 的过冲段是它的近似 |

### 值得补（12 个 → §2 的四条通道）

4 Stagger · 13 Wipe transition · 14 Text reveal · 15 Line reveal · 16 Word reveal ·
12 Mask reveal · 7 Crossfade · 25 Sticky scrollytelling · 28 Progress indicator ·
21 Parallax · 24 Scroll zoom · 19 Scramble text

其中两件小的可以顺手做掉：
- **7 Crossfade**：同一位置换内容（数字更新、对照切换）。现在只能靠"退场+入场"、中间必然空一拍；落地就是两个元素互补 delay，零新机制。
- **12 Mask reveal**：`MASK-UP/LEFT` 是**硬边** inset 擦出，Mask 用的是渐变蒙版 —— 能表达"擦出的边缘长什么样"（光线扫过 / 墨迹扩散）。这是把 §04 的"边缘手法"推进到动效层的一步，直接对应各套 §04 的裁决。

### 可用但先放着（5 个）

1 Easing · 2 Duration · 3 Delay 不是"动效"而是**规范**（其暴露的问题见 §5）；
17 Character reveal 中文长句不可用，只适合 4–8 字短标题，`Line/Word` 覆盖面更广；
20 Text morphing 多组件切换已经能表达；18 Typewriter 题材限定（命令行 / AI 生成），素材里出现再补；
26 Image sequence 等于"在视频里放视频"，需要专门素材。

---

## 4 动效预算 —— 把 UX 规则翻译成抽帧成本

词典第四层（Feedback / Affordance / Reduced motion）在视频里没有对应物，但其中一条可以翻译过来：
「整页文字都使用模糊会增加渲染压力」—— 在这里不是修辞，是**抽帧耗时**。

现状：`BLUR-IN` 用 `filter: blur(18px)`，另有两处 `backdrop-filter: blur(2px)` / `blur(8px)`，
而抽帧单帧约 **131ms**（`captureScreenshot` 开 `optimizeForSpeed` 后；改前 215~300ms）。

**三条硬线**：

| 线 | 值 |
|---|---|
| 每块板最多一个滤镜动画 | 同一帧叠两个 `filter`，成本是相加不是取大 |
| `blur` 半径 ≤18px，且只用于标题级（小面积） | 模糊成本随**面积**走，大面积糊化最贵 |
| `backdrop-filter` 不用于大面积常驻元素 | 它要求每帧重新采样背景，常驻即全程付费 |

抽帧才是渲染耗时的全部（编码约 93 帧/秒，只占 0.34%），**动效设计直接等于成片时长**。这条比任何"设计原则"都更能省下真实时间。

---

## 5 现有资产的三处缺口

1. **`STAGGER-IN` 名不副实** —— 名字承诺交错，实现是"位移 + 微旋"。（见 §2 ①）
2. **「≥3 种入场动效」这条硬线有漏洞** —— 13 种入场里 **5 种共用同一条 `cubic-bezier(.22,.85,.28,1)`**（`MASK-UP` / `MASK-LEFT` / `STAGGER-IN` / `GROW` / `SHIFT-IN`）。多样性只数"名字"，改个名字就能过线而手感不变。建议硬线补一句：**不同入场动效之间至少 3 条不同缓动曲线**（词典 1 号的原话就是"不要让所有动画使用同一种缓动"）。
3. **退场比入场单调得多** —— 入场 13 种、退场只有 4 种且全是 `0.4s ease-in`。退场决定"切换干不干净"，观感权重不低；补 `MASK-DOWN` / `WIPE-OUT` / `STAGGER-OUT` 比再加入场更值。
   顺带：`0.4s` 同时写死在 CSS 与 JS 的 `OUT_DUR` 里，两份模板各一份 —— 与已知的"两份 `template.html` 同源漂移"是同一类问题，动它之前先合并。

---

## 6 待裁决（先别动手）

| # | 事项 | 说明 |
|---|---|---|
| 1 | **转场归幕内还是全局时间轴** | 分幕模式下每幕是独立渲染单元，跨幕覆盖层会被裁掉 —— 倾向落幕内，由生成器插在"上一块的 `data-out` 与下一块的 `data-in` 之间"。这属于"要不要多一道"，先问再写。 |
| 2 | **`data-stg` / `data-hold-anim` 进不进契约** | 两个新字段都要同步改 `ivh-html-core/interop.md` + `check-template` 的动效名合法性检查，属于跨技能改动。 |
| 3 | **分幕模式下 `.anim` 的入场失效** | 修法便宜（复制 14 条规则改成 `.scene.active .anim[data-anim]`），但不做的话"一屏一幕 + 入场动效"只能用 `timeline`。 |

---

### 附：实测环境

- 脚本 `_tmp/verify-freeze.mjs`（Edge `--headless=new` + CDP 管道；本机跨进程回环 TCP 被安全软件拦，IPC 走管道）
- 结果 `_tmp/_freeze-result.txt` · 夹具 `_tmp/_freeze-fixture.html`
- 注意：两次独立启动的逐字节比对会报"有漂移"，逐项看是 **matrix 分量 1e-5 量级 / 个别 y 值 ±0.01px**，低于亚像素 —— 起因是 `off=0` 那步没做重挂（§1.2 的隐忧）。按本文结论动手时，`check-determinism.mjs` 的比对要留意这一点。
