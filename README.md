# media-skills

视频创作类 Skill 集合，配套 [Codex CLI](https://github.com/openai/codex)、[Claude Code](https://docs.claude.com/en/docs/claude-code) 与 WorkBuddy 使用。

当前是一套**信息图视频流水线**：把文稿、逐字稿或 SRT 变成成片或透明素材。四个 Skill 各管一环，产物是一份脚本 JSON 和单文件 HTML，环与环之间只靠约定好的文件与属性通信，不互相越界。

## 流水线

```text
文稿 / 逐字稿 / SRT
        │
        ↓
  ① ivh-script          写脚本
        │  脚本.json + 脚本.md        ← 闸门 1：用户确认文本
        ↓
   ┌────┴────┐
   ↓         ↓
② ivh-standalone   ③ ivh-overlay
   独立成片           透明素材
   成片.html          素材.html      ← 闸门 2：用户确认 HTML 效果
   └────┬────┘
        ↓
   ④ ivh-render        渲染         ← 闸门 3：出片前确认
        │
        ↓
   .mp4 (H.264)  或  .mov (ProRes 4444 + alpha)
```

## Skill 一览

| Skill | 环节 | 只干一件事 | 触发场景 |
| --- | --- | --- | --- |
| [ivh-script](./ivh-script) | ① 写脚本 | 文字 → 结构化脚本 JSON，判定支线（独立成片 / 透明素材）并锁定风格与画布 | 手上有稿子、字幕、文章想做成视频，但还没定「拍什么、每屏说什么、什么时候出现」 |
| [ivh-standalone](./ivh-standalone) | ② 独立视频 | 脚本 → 整屏多幕、连贯叙事的单文件 HTML（A-roll 主张 + B-roll 证据） | 「做独立视频」「把这个脚本做成完整视频」「生成一版信息图动画片」 |
| [ivh-overlay](./ivh-overlay) | ③ 透明素材 | 脚本 → 3:4 竖版透明素材 HTML（稀疏的强调贴片：章节 / 关键概念 / 数字图表） | 「做透明素材」「要叠加素材」「生成 B-roll 贴片」 |
| [ivh-render](./ivh-render) | ④ 渲染 | HTML → 视频，独立成片出 H.264 MP4，透明素材出 ProRes 4444 `.mov`，并复检 alpha 真伪 | 「导出视频」「渲染成 mp4」「把这个 HTML 录成视频」「要透明通道的 mov」 |

②③ 是并列的支线，二选一（也可按需各出一版）。**支线在 ① 判定，判错会让下游全部返工**，这是整条链上最贵的错。

## 三道闸门

机器只做「读文本」层面的校验，任何「好不好看」的判断都交给用户：

1. **文本**（① 交付后）—— 脚本 `脚本.json` 与 `脚本.md` 先给用户确认，再往下游走
2. **效果**（②③ 交付后）—— 生成的单文件 HTML 给用户看效果
3. **出片前**（④ 执行前）—— 确认尺寸、时长、编码与输出路径

每环交付前都必须跑各自的机器校验，**不过不许交付**：

```bash
node ivh-script/scripts/check-script.mjs 脚本.json          # 契约 + 提炼度校验
node ivh-standalone/scripts/check-template.mjs 成片.html     # 十一项自检
node ivh-overlay/scripts/check-template.mjs 素材.html        # 十一项自检
node ivh-render/scripts/check-alpha.mjs 素材.mov             # alpha 真伪
```

## 关键设计

- **单文件零依赖**：产物 HTML 不含 http 引用、外链或 `@import`，双击即可打开，方便归档与迁移。
- **职责隔离**：① 不写 HTML，②③ 不渲染，④ 不改内容。渲染层发现的问题回到上游改，不在下游打补丁。
- **契约先于实现**：`references/interop.md` 是 ②③④ 共用的产物契约（`data-*` 属性与运行时名字）；`references/script-format.md` 是 ① 的对外契约。
- **六个视觉风格**：`doodle` 手绘科普 · `riso` 潮流观点 · `blueprint` 技术工程 · `minimal` 商务数据 · `neon` 科技发布 · `pixel` 复古趣味。风格由用户在 ① 选定，下游取全套变量，不各自发挥。
- **三层文本**：口播稿（给听，15~40 字/句）、整屏标题（给看，≤2 行 × ≤12 字）、信息卡与标签（≤14 字/行，标签 ≤6 字）。屏幕字念出来不应与口播重复。
- **提炼先于排版**：屏幕字来自一条压缩链（抓手 → 论点 → 主张 → 屏幕字），主张必须**能被反驳**；每个位置写 5 个候选再挑 1 个。方法与判据见 `ivh-script/references/distillation.md`。
- **素材模式自动跳过空档**：透明素材只渲染「有内容的帧」，空档复用一张实测全透明的帧 —— 30s 素材的渲染帧数约降到 4 成，成品逐字节不变。

## 环境依赖

②③ 只产出 HTML，本身**不需要任何前置软件**。只有 ①④ 要装：

| 依赖 | 版本 | 用途 | 探测方式 |
| --- | --- | --- | --- |
| Node.js | 22+ 走快路，更低可用 | 跑全部校验与渲染脚本 | 仅用标准库，无需 `npm install` |
| FFmpeg / FFprobe | 5.1+ | ④ 合成与校验视频 | `IVH_FFMPEG` / `IVH_FFPROBE` → 常见安装位 → `PATH` |
| Chrome 或 Edge | 任意近期版本 | ④ 抽帧 | `IVH_BROWSER` → Windows / macOS / Linux 常见安装位 |

- **Node 22 是性能分界，不是功能分界**：抽帧的 CDP 快路径用 Node 自带的全局 `WebSocket`。
  低于 22 会自动回退到「每帧一个浏览器」的慢路径 —— 画面逐像素一致，只是慢一个数量级。
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

四个 Skill 相互独立，也可全部软链到 Codex 或 Claude Code 的 skills 目录：

```bash
git clone https://github.com/tdfydfy/media-skills.git ~/media-skills

for s in ivh-script ivh-standalone ivh-overlay ivh-render; do
  ln -s ~/media-skills/$s ~/.codex/skills/$s
  ln -s ~/media-skills/$s ~/.claude/skills/$s
done
```

Windows 上未开启开发者模式时无法创建符号链接，改用目录 junction：

```powershell
foreach ($s in "ivh-script","ivh-standalone","ivh-overlay","ivh-render") {
  cmd /c mklink /J "$env:USERPROFILE\.codex\skills\$s" "$env:USERPROFILE\media-skills\$s"
}
```

## 设计取向

- **一环一件事**：每个 Skill 只回答一个环节的问题，边界写进 SKILL.md 的「明确不做什么」，避免下游替上游做决定。
- **判定前置**：最贵的错误（支线判错、风格选错）放在最便宜的地方（第一批对话）解决。
- **机器校验 + 人工确认**：结构问题交给脚本，审美问题交给用户，不让机器猜「好不好看」。
- **稀疏优于堆砌**：透明素材每 60s 只放 8~12 个素材点，点与点之间留 ≥1.5s 纯透明空档，宁可少不可多。
- **不改上游**：渲染与校验脚本只读产物，发现问题回报上游修改，保持单一事实来源。
