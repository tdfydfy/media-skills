---
name: ivh-script-standalone
description: 信息图视频流水线第 1 环·独立成片——把文稿/逐字稿/SRT 写成「一条能独立发出去的成片」的脚本 JSON。整屏多幕、A-roll 主张 + B-roll 证据、每个意群都要有画面、有开场有收尾。当用户想"做一条完整的片子""把这份稿子做成视频""生成一版信息图动画片"，且画面要铺满整屏、能独立成片时使用。若产物是贴在别人画面上的稀疏贴片，请改用 ivh-script-overlay。
agent_created: true
---

# 写脚本 · 独立成片（第 1 环 A 支线）

**把文字变成 `purpose="standalone"` 的脚本 JSON。** 产出 `脚本.json` + 一份给人看的同名 `.md`，交给下游 `ivh-standalone`。你的边界就是那份 JSON。

```
文稿 / 逐字稿 / SRT + 使用场景
        ↓   ← 你在这里（整屏多幕的片子）
   脚本.json  ──→ ivh-standalone ──→ ivh-render ──→ .mp4
```

产物形态是**填空**：一屏一个主张，从头铺到尾，不留洞，A 开头 A 收尾。

**闸门 1 / 2 在本技能。** `脚本.json` + `脚本.md` 出来之后：跑校验盖章 → `present_files` 递出去
→ **本轮结束**。等用户看过说"可以"，排版才轮到 `ivh-standalone`。
用户一次性要的是最终视频，也照停 —— 闸门是分工：字没定，排版就是白排。

---

## 零、先问，别猜

| # | 要问的 | 为什么必须先定 |
|---|---|---|
| 1 | **风格**（六选一，让用户选，不要自己定） | 风格决定字号容字量，写完再换要回头重写字 |
| 2 | **画布比例**（`16:9` / `9:16` / `4:3` / `3:4`） | 决定每行能放几个字、元素怎么排 |
| 3 | **总时长上限** | 决定幕数；没上限时按 `voiceover` 自然长度 |
| 4 | **音轨在哪**（有 SRT / 有音频 / 只有文稿） | 决定时间码是量出来的还是估出来的 |

风格选项：`doodle` 手绘科普 · `riso` 潮流观点 · `blueprint` 技术工程 ·
`minimal` 商务数据 · `neon` 科技发布 · `pixel` 复古趣味。

`contentType`（内容体裁）拿到稿子就能看出来，判完写进 `meta` —— 它决定第 ① 步圈什么当抓手（见 `../ivh-script-core/distillation.md`）。

---

## 一、结构：幕（`scenes[]`）

```
scenes[]   role: open → body → close      （三类必须齐全）
             start/end  首尾相接、不重叠、不留洞
             aroll      这一屏的主张：标题 或 生成素材
             broll      这一屏的证据：数据 / 图表组件
             anim       入场动效
```

| 字段 | 本支线要点 |
|---|---|
| `aroll.text` | **≤2 行 × ≤12 字** |
| `aroll.emphasis` | **至多 1 个词**（强调两处等于没强调） |
| `broll.comp` | 15 个组件见 `../ivh-script-core/chart-choices.md` |
| `gen-*` | 由 `ivh-standalone` 落地（`genStatus` 由 `pending` → `done` 并回写 `src`） |

字段全貌与硬规则见 `../ivh-script-core/script-format.md` §一/§二。
三类 `role` 的标题气质、A-roll 与 B-roll 怎么配、常见错误见 `references/scenes.md`。

---

## 二、密度：密集、连贯

| | 值 |
|---|---|
| 一幕 | **5~8 秒** |
| 组件总量 | **每 10 秒 1~2 个**（3 分钟片 ≈ 20~35 个） |
| 幕与幕 | **首尾相接，不留缝** |
| 一屏之内 | 允许 A-roll 与 B-roll 同屏 |
| 60 秒片 | 约 8~12 幕 |

承接感来自衔接，不来自重叠；节奏靠组件交叠制造。
**开场必须有钩子，收尾必须能独立成一句话。** `scenes[].end` 的最大值必须 `== meta.totalDuration`。

---

## 三、三层文本

口播给耳朵，屏幕字给眼睛。**念出来不能和口播一样。**

| 层 | 落到哪 | 字数 |
|---|---|---|
| 口播稿 | `voiceover[].text` | 15~40 字/句 |
| 整屏标题 | `scenes[].aroll.text` | **≤2 行 × ≤12 字** |
| 信息卡 / 提示标签 | `scenes[].broll` 内的元素 | 6~14 字/行；标签 ≤6 字 |

共同规则（口播怎么写、信息卡怎么压、标签为什么必须 ≤6 字）见 `../ivh-script-core/text-layers.md`。

**整屏标题与口播是"主张 vs 论证"**：口播给推理，标题给结论 —— 标题是概括，不是复述。三类的气质见 `references/scenes.md` §二。

---

## 四、提炼

抓手 → 论点（带因果）→ 主张（能被反驳？）→ 屏幕字，四步与候选法见 `../ivh-script-core/distillation.md`。
本支线的落点是每一幕的整屏标题，**开场要钩子、收尾要金句**。

---

## 五、锚点

`parse-srt.mjs --candidates` 给三个入点（`sync` / `head` / `tail`），按类型挑，不要拿来就用第一个：

| 类型 | 用哪个 |
|---|---|
| 数字 / 结论 | `tail`（口播说完之后） |
| 结构 / 预告 | `head`（口播说到之前） |
| 概念 / 名词 | `sync`（与口播同步） |

本支线组件与口播并行推进、一屏活 5~8 秒，早一点晚一点都还接得上，所以**逐条按上表挑**即可（`head` / `sync` 居多）。机制与偏移量定义见 `../ivh-script-core/text-layers.md` §四。

---

## 六、交付：校验 → 递给用户 → 停

**1. 跑机器校验，并且盖章：**

```bash
node ../ivh-script-core/scripts/check-script.mjs 脚本.json --stamp
```

它会查契约硬规则 + 幕区间连续 + 双层文本不重复 + 第 7 项**提炼度**（空转标题 / 屏幕字重复 / 名词短语当标题 → FAIL）。**不过不许交付。**

`--stamp` 把 `{pass, fails, notes, hash}` 写进 `meta.check`，下游开跑前验这个章。

**闸门 1 / 2 —— 文本确认。** 校验过了之后的动作是固定的三步：

1. `present_files` 把 `.md` 递过去
2. `.md` 里要有一节 **「候选与选择」**：每个位置列出 5 个候选、标出选了哪个、为什么；
   贴的是校验器的**原始输出**，不要自己打勾
3. **本轮到此结束** —— 排版是下一环的活，等用户说"可以"再进 `ivh-standalone`

闸门 2 是 HTML 效果（`ivh-standalone`）；过了就交给 `ivh-render`，那一环只管出片。

---

## 七、自检

- [ ] `purpose` 是 `standalone`，`scenes` 非空、`points` 为空
- [ ] `contentType` 判对了，且与 `parse-srt --content` 一致
- [ ] 幕区间首尾相接、无洞、无重叠，末幕 `end == totalDuration`
- [ ] `role` 三类齐全；开场有钩子，收尾能独立成句
- [ ] 每幕 5~8s；每 10s 约 1~2 个组件
- [ ] 标题 ≤2 行 × ≤12 字，`emphasis` ≤1 个
- [ ] 屏幕字与口播**不完全重合**
- [ ] 校验器跑过、盖了章，`.md` 里贴的是**原始输出**
