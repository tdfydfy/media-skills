# media-skills

用于从视频、音频、SRT 或文稿制作透明叠加素材或独立视频画面的 Skill 集合。

当前主线是 `ivh-create` 与 `ivh-render`。`ivh-create` 只有一份简短的 `SKILL.md` 负责按用途路由，创作方法分散在 overlay（透明素材）与 standalone（独立画面）两个模式里，各自维护 workflow、creation、build 和运行底座；`ivh-render` 把确认过的 HTML 渲染成视频。独立画面与原音频分别放入剪辑软件，从零点对齐。

## 当前流程

```text
视频 / 音频 / SRT / 文稿
        |
        v
ivh-create：SKILL.md 选择模式
        |
        +--> overlay    workflow → creation → build，默认 1080×1440 透明画布
        +--> standalone workflow → creation → build，比例 / 尺寸 / 风格由用户选择
        |
        +--> script.md        <- 内容审核，停下等确认
        +--> script.html + preview.html   <- 效果审核，停下等确认
        |
        v
ivh-render（输出格式由产物 CONFIG.BG 决定）
        |
        +--> overlay    render/script-alpha.mov   透明 ProRes 4444，自动复检 alpha
        +--> standalone exports/script.mp4        无声 H.264 + 原音频进剪辑软件
```

两个模式走同一套阶段：策划交付 `script.md`，制作交付 `script.html` 与 `preview.html`，每一步都停下等确认；只有用户确认过效果并且已经要求出片，才进入渲染。策划与制作共享同一份 `script.md`，不通过 JSON 类型表或固定字段绑定组件。

## 目录入口

| 目录 | 作用 |
| --- | --- |
| [ivh-create](./ivh-create) | 主创作 Skill。从 [SKILL.md](./ivh-create/SKILL.md) 选择模式，再只读所选模式的文档。 |
| [overlay workflow](./ivh-create/modes/overlay/workflow.md) | 透明素材的入口，含 creation、build 与 `assets/base.html`。原视频承担声音和主体。 |
| [standalone workflow](./ivh-create/modes/standalone/workflow.md) | 独立画面的入口，含 creation、build 与 `assets/base.html`。连续场景、明暗反差、分层图片、本地图片与视频、音频预览。 |
| [styles](./ivh-create/styles) | 视觉参考。`soft-relief/spec.md` 与 `neon-terminal/spec.md` 是共用视觉身份；neon-terminal 另分 [overlay](./ivh-create/styles/neon-terminal/overlay.md)、[standalone](./ivh-create/styles/neon-terminal/standalone.md) 两份模式指引与对应展厅。 |
| [ivh-render](./ivh-render) | 渲染 Skill。`render.mjs` 一次完成前置检查、抽帧合成与透明复检；异步媒体产物走 CDP 等待就绪。 |
| [ivh-html-core/interop.md](./ivh-html-core/interop.md) | 产物契约：渲染器从源码读哪些属性。 |
| [examples/bilibili-levels](./ivh-create/examples/bilibili-levels) | 已跑通的真实 SRT 样例：原始字幕、策划稿、HTML、预览入口。 |
| [docs/standalone-mode.md](./docs/standalone-mode.md) | standalone 模式的确认边界、当前实现与验证范围。 |
| [ivh-next](./ivh-next) | 旧版实现参考，保留其成熟视觉资产和工程经验，不再作为新作品的主入口。 |

其余目录（`ivh-script-core`、`ivh-script-standalone`、`ivh-script-overlay`、`ivh-standalone`、`ivh-overlay`、`design-specs`）属于旧版流水线资产，除非需要提取参考，不作为当前流程的入口。

## 使用方式

### 1. 策划内容

把视频、音频、SRT 或文稿交给 `ivh-create`。透明素材读 [overlay creation](./ivh-create/modes/overlay/creation.md)，独立画面读 [standalone creation](./ivh-create/modes/standalone/creation.md)，交付 `script.md`。

独立模式在正式策划前确认比例、输出尺寸与视觉风格（用户选择，明确委托时可代选），并按音频绝对时间安排连续场景，保留停顿和尾音。策划稿写明保留哪些信息、屏幕文案、来源时间区间、素材与后期补入方案，以及事实上的不确定处；格式建议用来帮助下一阶段理解意图，不是要逐项照抄的字段。

### 2. 制作并预览 HTML

确认策划稿后，按 [overlay build](./ivh-create/modes/overlay/build.md) 或 [standalone build](./ivh-create/modes/standalone/build.md) 和选定风格制作 HTML，底座从所选模式的 `assets/base.html` 起。透明模式默认 1080×1440 透明画布；独立模式使用用户选定的尺寸，图片、视频与预览音频放在作品 `assets/` 下用相对路径引用。

本地打开 `script.html?view=1` 预览动画，用 `script.html?t=秒` 定位特定时刻；`preview.html` 是同目录的轻量跳转入口。两种模式都提供 `window.IVH.seekAt(t)`，独立模式返回 Promise，等图片解码与视频定位完成后才结算，渲染器据此等待。确认 HTML 效果后才进入渲染。

### 3. 渲染

从仓库根目录运行，显式指定本次作品目录：

```bash
node ivh-render/scripts/render.mjs <作品目录>/script.html --out <作品目录>/exports
```

默认 `normal` 预设以 25fps 采样并输出 30fps CFR。输出格式由产物自己的 `CONFIG.BG` 决定：透明产物输出 ProRes 4444 MOV 并自动抽 alpha 复检，不透明产物输出无声 H.264 MP4。`--preflight` 只检查源码约定，不验证媒体加载与观感。

```bash
node ivh-render/scripts/render.mjs <作品目录>/script.html --preflight
node ivh-render/scripts/render.mjs <作品目录>/script.html --preset fine --keep-frames
```

渲染需要 Node.js、FFmpeg/FFprobe 和近期的 Chrome 或 Edge；抽帧默认走 CDP 管道。详细参数、引擎选择与环境变量见 [ivh-render/SKILL.md](./ivh-render/SKILL.md)。

## 已验证能力

`bilibili-levels` 样例已从真实 SRT 跑通透明素材的完整流程：定时卡片、透明 HTML、预览、代表帧检查、正常预设渲染和 alpha 抽检，输出 1080×1440、30fps、183.57 秒的 ProRes 4444 MOV，抽 12 帧检查平均 73.66% 像素完全透明。详细记录见 [ivh-create-plan.md](./docs/ivh-create-plan.md)。

独立模式目前完成到工程验证：模式文档、独立底座（连续场景、深浅演示、音频预览、非循环正速视频映射）与渲染侧异步等待均已落地，`standalone.test.mjs` 覆盖本地图片、视频源偏移与反向定位、末帧、音频预览定位、无声导出、媒体异常与 CLI 拦截。真实音频长样片的观感、实际生图分层的效果与不同视频编码的兼容性仍按具体作品验证，工程测试通过不等于观感审核通过。

## 后续工作

1. 用内容结构不同的真实素材继续跑完整流程，验证两个模式的泛化能力。
2. 根据实际作品中重复出现的需求，补强已有风格的组件、布局和动效参考；一次性的画面选择留在作品内。
3. 需要新风格时先写独立的 `spec.md`，再做小样例验证，不改动共用视觉身份与模式的运行契约。
4. 只为重复且影响交付的问题增加自动检查，保持运行底座、文件格式和渲染接口简单稳定。
5. 当创作与渲染的独立调用确实变频繁时，再评估是否拆分 Skill 或扩展安装入口。

## 设计边界

- `script.md` 保留内容意图，`script.html` 负责视觉落地，`ivh-render` 只出片。
- 风格 MD 是模型的主要视觉依据；展厅 HTML 用于看效果、参考实现和复用运行底座，不整块搬进产物。
- 组件提供一致性，不构成封闭的页面类型；模型可以组合、适配或新增符合风格的结构。
- 时间契约两种模式通用：`#track` 下的时间组带 `data-in` / `data-out`，单位是原片绝对秒，任意时刻可定格。带 `data-ivh-async-media` 的产物走 CDP 等待媒体就绪，CDP 不可用时停止而不退回 CLI；普通同步透明产物保留原有回退。
- 每次执行都在输出根目录下新建按内容命名的作品文件夹（默认 `outputs/<主题>/`，重名追加序号），不覆盖历史产物，也不在历史作品目录内嵌套输出。
