# 脚本文件格式（v1）

> **共享层文档。** 两个脚本技能都产出这一份 JSON，`ivh-standalone` / `ivh-overlay` 都以它作为唯一输入。
> 两条支线用同一个 schema，区别只在填哪个数组 —— `standalone` 填 `scenes[]`、`overlay` 填 `points[]`，另一个留空数组。
> 交付物是 `.json`（下游 `JSON.parse` 直读）；可读性另出一份同名 `.md`，只给人看。

## 一、完整结构

```json
{
  "version": 1,
  "meta": {
    "title": "渠道下沉带来的结构性增长",
    "purpose": "standalone",
    "totalDuration": 62.4,
    "ratio": "16:9",
    "bg": "opaque",
    "style": "doodle",
    "sourceType": "transcript",
    "contentType": "data",
    "aRollSource": "mixed"
  },
  "voiceover": [
    { "i": 1, "start": 0.0, "end": 3.8, "text": "我们先看一个反常识的数据。" }
  ],
  "scenes": [],
  "points": []
}
```

### meta

| 字段 | 取值 | 说明 |
|---|---|---|
| `title` | 字符串 | 用于文件名与交付说明，不出现在画面里 |
| `purpose` | `standalone` \| `overlay` | 决定填哪个数组、下游走哪条支线。**在选技能时已定死** |
| `totalDuration` | 数字（秒） | 音轨总长（通常 = `voiceover` 末句 `end`）；无音频时才按 `字/4.5` 估 |
| `ratio` | `16:9` `9:16` `4:3` `3:4` | `standalone` 四选一；`overlay` 恒为 `3:4` |
| `bg` | `opaque` \| `transparent` | `standalone` 可透明；`overlay` 恒为 `transparent` |
| `style` | `doodle` `riso` `blueprint` `minimal` `neon` `pixel` | 六选一，全片不混搭 |
| `sourceType` | `srt` \| `transcript` \| `article` \| `none` | 输入形态。`none` = 连逐字稿都是生成的 |
| `contentType` | `data` \| `narrative` \| `drama` \| `opinion` | 内容体裁：`data` 研报口播 · `narrative` 故事案例 · `drama` 剧情短剧 · `opinion` 观点评论。决定提炼抓手（`distillation.md` §二）与 `overlay` 的贴片密度档（`../ivh-script-overlay/SKILL.md`） |
| `aRollSource` | `title` \| `gen` \| `mixed` | 仅 `standalone`：A-roll 画面从哪来 |
| `check` | 对象 | 校验凭据，由 `check-script.mjs --stamp` 写入（手写会被指纹校验判为不一致） |

`contentType` 必须与 `parse-srt.mjs --content` 一致 —— 不一致时不报错，只静默给出 0 条候选。

### voiceover[] —— 时间基准（两条支线都必填）

「这条音频在第几秒说了什么」，也是全片**唯一的时间基准**：`scenes[]` / `points[]` 的 `start/end` 都由它推出。

| `purpose` | 记录谁的声音 |
|---|---|
| `standalone` | 本片自己的口播 |
| `overlay` | 宿主视频里那位的口播 |

| 字段 | 说明 |
|---|---|
| `i` | 序号，从 1 起 |
| `start` / `end` | 绝对秒，**来自音频**（SRT / ASR 的真实时间码） |
| `text` | 一句话。耳朵听的，不是屏幕上的字 |

- 有音频 / 视频 → 转 SRT 或 ASR，`start` / `end` 用真实时间码。`overlay` 只能如此，估出来的秒一定错位。
- 连音频都没有、纯从文稿起手 → 才按 `秒 ≈ 字数 / 4.5` 累积估算，交付说明里注明「时间码为估算」。
- 全片确实无人声（纯音乐 / 画面）→ `voiceover` 可为空，但 `totalDuration` 与各点时间须另有基准并写清。

### scenes[] —— 幕（仅 `purpose=standalone`）

整屏叙事单元，一屏一个主张，按时间顺序铺满全片。

```json
{
  "i": 1,
  "role": "open",
  "start": 0.0,
  "end": 6.4,
  "aroll": {
    "type": "title",
    "kicker": "2026 · 市场观察",
    "text": "渠道下沉\n带来结构性增长",
    "emphasis": "结构性"
  },
  "broll": { "comp": "c-data", "note": "留白，先不给数字" },
  "anim": "MASK-UP"
}
```

| 字段 | 取值 | 说明 |
|---|---|---|
| `role` | `open` \| `body` \| `close` | 开场 / 主体 / 收尾，整片各至少一个 |
| `start` / `end` | 绝对秒 | 幕与幕**首尾相接、不重叠** |
| `aroll.type` | `title` \| `gen-image` \| `gen-video` | `title` = 排版标题（零依赖）；`gen-*` = 生成素材 |
| `aroll.text` | 字符串，`\n` 换行 | **≤2 行、每行 ≤12 字** |
| `aroll.kicker` | 字符串，≤10 字 | 可选，眉题（时间 / 章节 / 出处） |
| `aroll.emphasis` | 字符串 | 可选，`text` 里要强调的一个词 |
| `aroll.prompt` | 字符串 | `type=gen-*` 时的生成提示词 |
| `aroll.src` | 相对路径 | 生成后的落盘路径，未生成为 `null` |
| `broll.comp` | 组件类名 | 见 `../ivh-html-core/components.md`；不需要就填 `null` |
| `broll.note` | 字符串 | 可选，给下游的一句意图说明 |
| `anim` | 见下方清单 | 入场动效 |

`gen-*` 由 `ivh-standalone` 落地：先 `genStatus:"pending"` 交出去，拿到文件后回写 `src` 并置 `genStatus:"done"`。

### points[] —— 素材点（仅 `purpose=overlay`）

稀疏呼应点，只挑值得停一眼的地方。

```json
{
  "i": 3,
  "kind": "data",
  "start": 12.4,
  "end": 16.8,
  "comp": "c-flow",
  "elements": [
    { "role": "st", "t": "一线城市", "v": "40%" },
    { "role": "arrow", "label": "渠道下沉" },
    { "role": "st", "t": "三四线", "v": "70%+" }
  ],
  "anim": "MASK-UP",
  "outAnim": "SCALE-OUT"
}
```

| 字段 | 取值 | 说明 |
|---|---|---|
| `kind` | `chapter` \| `concept` \| `data` \| `image` | 四类呼应点，决定组件族 |
| `start` / `end` | 绝对秒 | 停留 **≥0.8s**；与相邻点留 **≥1.5s** 纯透明空档 |
| `comp` | 组件类名 | 关系型优先（`c-flow` / `c-stack` / `c-cmp`） |
| `elements` | 数组，**2~3 个** | 一组元素 + 它们的关系。1 个 = 字幕卡，超 3 个该拆成两点 |
| `anim` / `outAnim` | 见下方清单 | 入场 / 退场动效 |

`elements[].role` 允许值：`st` `arrow` `sep` `kw` `line` `txt`；到组件的映射见 `../ivh-html-core/components.md`。

### 动效名清单（只能用这些）

| 用途 | 合法值 |
|---|---|
| 入场 `anim` | `MASK-UP` `MASK-LEFT` `BLUR-IN` `DRAW-UNDER` `SCALE-POP` `STAGGER-IN` `HARD-IN` `POP-IN` `PIXEL-IN` `GROW` `FADE-IN` `CALM-IN` `SHIFT-IN` `NONE` |
| 退场 `outAnim`（仅 `points[]`） | `FADE-SHIFT` `SCALE-OUT` `SLIDE-OUT` `FADE-OUT` |

名字写错不会报错、只会**静默不动**，所以 `check-script.mjs` 第 5b 项会拦。缺省 `MASK-UP`；
`overlay` 单条素材内至少用 3 种入场（素材只活 3~5 秒，入场就是它的全部表演）。手感与适用场景见 `../ivh-html-core/components.md`。

## 二、硬校验

| # | 规则 | 违例后果 |
|---|---|---|
| 1 | `purpose=standalone` ⇒ `scenes` 非空且 `points` 为空 | 下游不知道读哪个数组 |
| 2 | `purpose=overlay` ⇒ `points` 非空且 `scenes` 为空 | 同上 |
| 3 | `overlay` 的 `ratio` 必须 `3:4`、`bg` 必须 `transparent` | 素材形态被破坏 |
| 4 | `scenes` 区间首尾相接、不重叠、不留洞 | 成片出现黑场或跳帧 |
| 5 | `points` 两两不重叠，相邻空档 ≥1.5s | 叠加层变成「第二块屏」 |
| 6 | `points[].elements.length ≤ 3` | 一块板放不下 |
| 7 | `scenes[].role` 三类齐全 | 缺开场或收尾，片子不成立 |
| 8 | `scenes[].end` 最大值 == `meta.totalDuration` | 下游时长算错 |

第 4~8 条由 `scripts/check-script.mjs` 强制，**不过不许交付**。
它另查一组**提炼度**硬线（空转标题 / 屏幕字重复 / body 标题只是名词短语），判据见 `distillation.md` §七。

## 三、边界

这份契约到 `comp` 的**类名**为止 —— 坐标、样式、动效实现、渲染编码都是下游的事。
