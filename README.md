# media-skills

视频创作类 Skill 集合，配套 [Codex CLI](https://github.com/openai/codex)、[Claude Code](https://docs.claude.com/en/docs/claude-code) 与 WorkBuddy 使用。

当前是一套**信息图视频流水线**：把文稿、逐字稿或 SRT 变成成片或透明素材。产物是一份脚本 JSON 和单文件 HTML，环与环之间只靠约定好的文件与属性通信，不互相越界。

## 流水线

```text
文稿 / 逐字稿 / SRT + 宿主音轨
        │
        ├──────────────────────────┐
        ↓                          ↓
①a ivh-script-standalone   ①b ivh-script-overlay     写脚本（两条支线，二选一）
        │                          │
        └────────────┬─────────────┘
                     │  脚本.json + 脚本.md        ← 闸门 1：用户确认文本
                     ↓
              ┌──────┴──────┐
              ↓             ↓
     ② ivh-standalone  ③ ivh-overlay
        独立成片           透明素材
        成片.html          素材.html               ← 闸门 2：用户确认 HTML 效果
              └──────┬──────┘
                     ↓
              ④ ivh-render        渲染
                     │
                     ↓
            .mp4 (H.264)  或  .mov (ProRes 4444 + alpha)
```

**① 分成两个技能，是因为两种脚本的写法互斥** —— 一条要连贯、每句都配画面；
一堆要稀疏、只挑几处呼应。混在一个技能里，它会用同一套密度规则和锚点规则
去处理两种内容，最后哪边都不对。所以：**用途在选技能时就定死，不写"两用"脚本。**

## Skill 一览

| Skill | 环节 | 只干一件事 | 触发场景 |
| --- | --- | --- | --- |
| [ivh-script-standalone](./ivh-script-standalone) | ①a 写脚本·成片 | 文字 → 整屏多幕、连贯叙事的脚本 JSON（`scenes[]`） | 「做一条完整的片子」「把这份稿子做成视频」，画面铺满整屏 |
| [ivh-script-overlay](./ivh-script-overlay) | ①b 写脚本·素材 | 文字 → 3:4 稀疏贴片的脚本 JSON（`points[]`），时间跟宿主音轨 | 「做透明素材」「要叠加素材」「贴在剪映里」 |
| [ivh-standalone](./ivh-standalone) | ② 独立视频 | 脚本 → 整屏多幕、连贯叙事的单文件 HTML（A-roll 主张 + B-roll 证据） | 「做独立视频」「生成一版信息图动画片」 |
| [ivh-overlay](./ivh-overlay) | ③ 透明素材 | 脚本 → 3:4 竖版透明素材 HTML（稀疏的强调贴片） | 「做透明素材」「生成 B-roll 贴片」 |
| [ivh-render](./ivh-render) | ④ 渲染 | HTML → 视频，独立成片出 H.264 MP4，透明素材出 ProRes 4444 `.mov`，并复检 alpha 真伪 | 「导出视频」「要透明通道的 mov」 |

### 共享层（不是 Skill）

| 目录 | 是什么 |
| --- | --- |
| [ivh-script-core](./ivh-script-core) | ① 两个脚本技能共用的**契约与工具**：`script-format.md`（JSON 契约）、`text-layers.md`、`distillation.md`、`chart-choices.md`、`scripts/parse-srt.mjs`、`scripts/check-script.mjs` |
| [ivh-html-core](./ivh-html-core) | ②③④ 共用的**产物契约与词汇表**：`interop.md`（`data-*` 属性与运行时名字）、`components.md`（组件库 15 种 + 动效清单）、`visual-styles.md`（六风格规格） |
| [design-specs](./design-specs) | **风格规范库（设计资产，不是运行时契约）**：6 套完整视觉语言，每套 `design-spec.html` + `design-spec.md` + `cover.jpg`；入口是 `index.html`（定位图 + 卡片 + 横向对比表 + 十六格检查表）；`motion-spec.md` 是**动效公共层** |

**它们都没有 `SKILL.md`，不会被当成技能加载。** `ivh-script-core` / `ivh-html-core` 是流水线的共享契约，靠相对路径 `../ivh-*-core/…` 被引用；`design-specs` 是**给人（和 AI）看的设计资产库**，不参与运行时，也不被任何技能的 `SKILL.md` 引用。

> **为什么共享面必须只有一个物理副本**：这份仓库里已经踩过三次 ——
> `interop.md` 被三个技能各存一份，长成**三个不同版本**；`visual-styles.md` 两份侥幸一致；
> `components.md` 的组件库与动效表，两份各有约 150 行字面重复。
> 下游拿到哪一份，行为就变一次，而且没人知道变了。

## 两道闸门

机器只做「读文本」层面的校验，任何「好不好看」的判断都交给用户：

1. **文本**（① 交付后）—— `脚本.json` 与 `脚本.md` 先给用户确认，再往下游走
2. **效果**（②③ 交付后）—— 生成的单文件 HTML 给用户看效果

**闸门是「停下等回复」，不是「顺口提一句」。** 两道闸门的动作完全一样：
跑校验 → `present_files` 递出产物 → **本轮回复就此结束**，下一环要等用户下一轮说"可以"。

**用户开口就说"帮我做一条视频"（目标是终产物）不构成放行。** 两环仍然逐道停 ——
字没定，排版就是白排。过了闸门 2 就一路到底：**④ `ivh-render` 只管出片，不再设卡。**
每道闸门的具体动作写在各自 `SKILL.md` 的交付节里，不在本文件。

每环交付前都必须跑各自的机器校验，**不过不许交付**：

```bash
node ivh-script-core/scripts/check-script.mjs 脚本.json --stamp   # 契约 + 提炼度，并盖章
node ivh-standalone/scripts/check-template.mjs 成片.html           # 十二项自检
node ivh-overlay/scripts/check-template.mjs 素材.html              # 十二项自检
node ivh-render/scripts/check-alpha.mjs 素材.mov                   # alpha 真伪
```

**脚本校验会盖章**（`--stamp` 把 `{pass, hash}` 写进 `meta.check`）。
②③ 开跑前先验章：**没盖章、或指纹与内容不符，直接拒收** ——
因为曾经出过「校验根本没跑，但交付文档里写着 ✅ 通过」的事。

## 关键设计

- **单文件零依赖**：产物 HTML 不含 http 引用、外链或 `@import`，双击即可打开，方便归档与迁移。
- **职责隔离**：① 不写 HTML，②③ 不渲染，④ 不改内容。渲染层发现的问题回到上游改，不在下游打补丁。
- **契约先于实现**：`ivh-script-core/script-format.md` 是两个脚本技能的对外契约，
  `ivh-html-core/interop.md` 是 ②③④ 共用的产物契约（`data-*` 属性与运行时名字）。
- **一根轴定结构，一根轴定抓手**：`meta.purpose` 决定填哪个数组（在选技能时定死），
  `meta.contentType` 决定圈什么当屏幕字（`data` / `narrative` / `drama` / `opinion`）。**两轴正交。**
- **时间码来自音轨，不是估的**：两条支线都拿 SRT / ASR 的真实时间码做基准，
  只有手上连音频都没有时才按 `字/4.5` 估算；透明素材的时间码必须来自宿主音轨，它贴的是别人拍好的画面。
- **六个视觉风格**：`doodle` 手绘科普 · `riso` 潮流观点 · `blueprint` 技术工程 · `minimal` 商务数据 · `neon` 科技发布 · `pixel` 复古趣味。风格由用户在 ① 选定，下游取全套变量，不各自发挥。
- **三层文本**：口播稿（给听，15~40 字/句）、整屏标题（给看，≤2 行 × ≤12 字）、信息卡与标签（≤14 字/行，标签 ≤6 字）。屏幕字念出来不应与口播重复。
- **提炼先于排版**：屏幕字来自一条压缩链（抓手 → 论点 → 主张 → 屏幕字），主张必须**能被反驳**；每个位置写 5 个候选再挑 1 个。方法与判据见 `ivh-script-core/distillation.md`。
- **素材模式自动跳过空档**：透明素材只渲染「有内容的帧」，空档复用一张实测全透明的帧 —— 30s 素材的渲染帧数约降到 4 成，成品逐字节不变。

## 环境依赖

②③ 只产出 HTML，本身**不需要任何前置软件**。只有 ①④ 要装：

| 依赖 | 版本 | 用途 | 探测方式 |
| --- | --- | --- | --- |
| Node.js | 22+ 走快路，更低可用 | 跑全部校验与渲染脚本 | 仅用标准库，无需 `npm install` |
| FFmpeg / FFprobe | 5.1+ | ④ 合成与校验视频 | `IVH_FFMPEG` / `IVH_FFPROBE` → 常见安装位 → `PATH` |
| Chrome 或 Edge | 任意近期版本 | ④ 抽帧 | `IVH_BROWSER` → Windows / macOS / Linux 常见安装位 |

- **Node 22 是性能分界，不是功能分界**：抽帧的 CDP 快路径优先走 **CDP 管道**
  （`--remote-debugging-pipe`，整条链路都在父子进程的匿名管道里，不碰网络），
  管道不通时才退到 DevTools WebSocket —— 那条用 Node 自带的全局 `WebSocket`（要 22+）。
  两条都不通就回退到「每帧一个浏览器」的慢路径 —— 画面逐像素一致，只是慢一个数量级。
- **FFmpeg 5.1 是 `-fps_mode` 的起点**，更早的版本只有 `-vsync`。脚本两个名字都能用，
  认不出来就换另一个重试，所以写死任何一个都不会让透明复检失效。

装：

```powershell
winget install OpenJS.NodeJS.LTS
winget install Gyan.FFmpeg          # Edge 系统自带，一般可跳过
```

```bash
brew install node ffmpeg            # macOS
```

装完验一下，三条都要有输出：

```bash
node -v && ffmpeg -version && ffprobe -version
```

探测不到时显式指定（便携版、多版本共存、装了但没进 `PATH`，都靠这个）：

```powershell
$env:IVH_FFMPEG  = "D:\tools\ffmpeg\bin\ffmpeg.exe"
$env:IVH_FFPROBE = "D:\tools\ffmpeg\bin\ffprobe.exe"
$env:IVH_BROWSER = "D:\tools\chrome\chrome.exe"
```

**缺哪个会怎样** —— 出问题就报错退出，不会静默出错：

| 缺 | 后果 | 怎么补 |
| --- | --- | --- |
| Node.js | 全链路不可用 | 必须装 |
| FFmpeg | ④ 帧照抽，但合成不出文件；`render.mjs` 最后以「没有找到预期产物」退出 | 装，或设 `IVH_FFMPEG` / 加进 `PATH` |
| FFprobe | 透明复检取不到时长，抽样间隔退化成 0（改成抽全片 alpha） | 与 ffmpeg 同目录即可，脚本会顺着 ffmpeg 的位置找 |
| Chrome / Edge | ④ 直接报错退出，出不了片 | 装，或设 `IVH_BROWSER` |

## 安装

**⚠️ 必须把两个共享层 `ivh-script-core` / `ivh-html-core` 和其余技能放在同一个父目录下** ——
它们靠 `../ivh-script-core/…` 相对引用，只链接其中一个会断路径。

```bash
git clone https://github.com/tdfydfy/media-skills.git ~/media-skills

for s in ivh-script-core ivh-script-standalone ivh-script-overlay \
         ivh-html-core ivh-standalone ivh-overlay ivh-render; do
  ln -s ~/media-skills/$s ~/.codex/skills/$s
  ln -s ~/media-skills/$s ~/.claude/skills/$s
done
```

Windows 上未开启开发者模式时无法创建符号链接，改用目录 junction：

```powershell
$ss = "ivh-script-core","ivh-script-standalone","ivh-script-overlay",
      "ivh-html-core","ivh-standalone","ivh-overlay","ivh-render"
foreach ($s in $ss) {
  cmd /c mklink /J "$env:USERPROFILE\.codex\skills\$s" "$env:USERPROFILE\media-skills\$s"
}
```

## 设计取向

- **一环一件事**：每个 Skill 只回答一个环节的问题，边界写在各自的 `SKILL.md` 里，避免下游替上游做决定。
- **用途先于内容**：最贵的错误（支线判错）放在最便宜的地方（选技能那一步）解决 ——
  选错技能等于换一份产物，不是改几行字。
- **判定前置**：风格、画幅、体裁在第一批对话里问清，不留到下游猜。
- **稀疏优于堆砌**：透明素材点与点之间留 ≥1.5s 纯透明空档，宁可少不可多。
