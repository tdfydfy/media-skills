# 脚本文件格式（v1）

> **这是 `ivh-script` 的唯一产出物，也是 `ivh-standalone` / `ivh-overlay` 的唯一输入。**
> 三个技能靠这一份 JSON 解耦：上游只管写字，下游只管画图，谁也不读谁内部的东西。

## 一、为什么是 JSON

口播稿可以给人读，但下游技能需要**逐条、按秒、可校验**地消费它。
写成 Markdown 的话下游得做自然语言解析，一处笔误就整条链崩。所以：

- **交付物是 `.json`**，字段固定，下游用 `JSON.parse` 直读。
- **可读性由 `ivh-script` 同时导出一份同名 `.md`**（只给人看，下游不读）。
- 字段名一旦发布不再改，要加就加在末尾，靠 `version` 区代。

## 二、完整结构

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
| `purpose` | `standalone` \| `overlay` | **分水岭**。决定下游走哪条支线，见下 |
| `totalDuration` | 数字（秒） | 成片总长。有 SRT 时取末句 end，无 SRT 时按 `字/4.5` 估 |
| `ratio` | `16:9` `9:16` `4:3` `3:4` | `standalone` 四选一；`overlay` **恒为 `3:4`** |
| `bg` | `opaque` \| `transparent` | `standalone` 可透明（整屏透明叠加）；`overlay` **恒为 `transparent`** |
| `style` | `doodle` `riso` `blueprint` `minimal` `neon` `pixel` | 六选一，全片不混搭 |
| `sourceType` | `srt` \| `transcript` \| `article` \| `none` | 输入形态。`none` 表示连逐字稿都是生成的 |
| `aRollSource` | `title` \| `gen` \| `mixed` | 仅 `standalone`：A-roll 画面从哪来 |

### voiceover[] —— 口播稿（按耳朵写）

只在稿件里确实有人声时才有。`standalone` 通常有，`overlay` 通常没有（它贴的是别人的口播）。

| 字段 | 说明 |
|---|---|
| `i` | 序号，从 1 起 |
| `start` / `end` | 绝对秒。有 SRT 直接取；没有则按 `秒 ≈ 字数 / 4.5` 累积 |
| `text` | 一句话。**这是耳朵听的，不是屏幕上的字** |

`overlay` 没有逐字稿时，`voiceover` 可以省略 —— 只要 `points[].start/end` 有值即可。

### scenes[] —— 幕（**仅 `purpose=standalone`**）

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
| `role` | `open` \| `body` \| `close` | 开场 / 主体 / 收尾。整片必须有且各至少一个 |
| `start` / `end` | 绝对秒 | 幕与幕**首尾相接、不重叠**（承接感来自衔接，不是重叠） |
| `aroll.type` | `title` \| `gen-image` \| `gen-video` | `title` = 排版标题（零依赖）；`gen-*` = 生成素材 |
| `aroll.text` | 字符串，`\n` 换行 | `type=title` 时用。**≤2 行、每行 ≤12 字** |
| `aroll.kicker` | 字符串，≤10 字 | 可选，眉题（时间 / 章节 / 出处） |
| `aroll.emphasis` | 字符串 | 可选，`text` 里要强调的一个词，会被高亮 |
| `aroll.prompt` | 字符串 | `type=gen-*` 时的生成提示词；`genStatus` 见下 |
| `aroll.src` | 相对路径 | 生成完成后的落盘路径，未生成时为 `null` |
| `broll.comp` | 组件类名 | 见各技能 `components.md`；不需要就填 `null` |
| `broll.note` | 字符串 | 可选，给下游的一句意图说明 |
| `anim` | 动效名 | 入场动效 |

`gen-*` 的落地流程由 `ivh-standalone` 负责：先 `genStatus:"pending"` 交给生成，
拿到文件后回写 `src` 并置 `genStatus:"done"`。**脚本里两种都写清楚，下游不许自己改类型。**

### points[] —— 素材点（**仅 `purpose=overlay`**）

稀疏呼应点。**不是每句话都要呼应**，只挑值得停一眼的地方。

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
| `start` / `end` | 绝对秒 | 停留 **≥0.8s**；与相邻点之间留 **≥1.5s** 纯透明空档 |
| `comp` | 组件类名 | 关系型优先（`c-flow` / `c-stack` / `c-cmp`） |
| `elements` | 数组，**≤3 个** | 一组元素 + 它们的关系。超 3 个说明该拆成两个素材点 |

`elements[].role` 允许值：`st`（块）`arrow`（箭头）`sep`（分隔线）`kw`（关键词）`line`（引线）`txt`（说明）。
具体到组件的映射见 `ivh-overlay/references/components.md`。

## 三、硬校验（写脚本时必须自检）

| # | 规则 | 违例后果 |
|---|---|---|
| 1 | `purpose=standalone` ⇒ `scenes` 非空且 `points` 为空 | 下游不知道该读哪个数组 |
| 2 | `purpose=overlay` ⇒ `points` 非空且 `scenes` 为空 | 同上 |
| 3 | `overlay` 的 `ratio` 必须是 `3:4`、`bg` 必须是 `transparent` | 素材形态被破坏 |
| 4 | `scenes` 的区间首尾相接、不重叠、不留洞 | 成片出现黑场或跳帧 |
| 5 | `points` 两两不重叠，且相邻空档 ≥1.5s | 叠加层变成"第二块屏" |
| 6 | 每个 `points[].elements.length ≤ 3` | 一块板上放不下 |
| 7 | `scenes` 里 `role` 三类齐全 | 缺开场或缺收尾，片子不成立 |
| 8 | `scenes[].end` 的最大值 == `meta.totalDuration` | 下游时长算错 |

第 4~8 条由 `ivh-script/scripts/check-script.mjs` 强制校验，**不过不许交付**。

## 四、它不负责什么

- 不管 HTML、不管 CSS、不管动效怎么实现 —— 那些是 ②③ 的事。
- 不管渲染、不管编码 —— 那是 ④ 的事。
- `comp` 只写**类名**，不写坐标、不写样式。落点由下游按画布决定。
