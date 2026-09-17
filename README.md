# media-skills

用于从口播视频、SRT 或文稿制作信息图透明叠加素材的 Skill 集合。

当前主线是 `ivh-create` 与 `ivh-render`：前者完成内容策划和 HTML 制作，后者将确认过的 HTML 渲染为带 alpha 通道的视频。它把稳定性放在少量运行约定和风格参考上，把内容编排与视觉设计留给模型判断。

## 当前流程

```text
视频 / SRT / 文稿
        |
        v
ivh-create: 内容策划
        |
        +--> script.md                 <- 确认内容、事实、时间和表达意图
        |
        v
ivh-create: HTML 制作
        |
        +--> script.html?view=1        <- 确认画面和动画效果
        |
        v
ivh-render
        |
        +--> transparent ProRes 4444 MOV
```

内容策划与 HTML 制作共享同一份 `script.md`，不通过 JSON 类型表或固定字段绑定组件。风格中的成熟组件是可靠的起点，HTML 阶段可以根据内容调整布局、容量、节奏和细节；重复证明有价值的新结构，才补入风格参考。

## 目录入口

| 目录 | 作用 |
| --- | --- |
| [ivh-create](./ivh-create) | 主创作 Skill。输入原始材料或已确认的策划稿，输出 `script.md` 与单文件 `script.html`。从 [SKILL.md](./ivh-create/SKILL.md) 开始。 |
| [ivh-render](./ivh-render) | 渲染 Skill。读取确认后的 HTML，输出视频；透明素材自动复检 alpha 通道。 |
| [ivh-create/examples/bilibili-levels](./ivh-create/examples/bilibili-levels) | 已跑通的真实 SRT 样例，包含原始字幕、策划稿、HTML、预览和渲染产物。 |
| [ivh-next](./ivh-next) | 旧版实现参考，保留其成熟视觉资产和工程经验，不再作为新作品的主入口。 |

其余目录属于旧版流水线或历史设计资产，除非需要提取参考，不作为当前流程的依赖或入口。

## 使用方式

### 1. 策划内容

把视频、SRT 或文稿交给 `ivh-create`。它先读取 [creation.md](./ivh-create/creation.md)，结合选定风格的展示倾向，交付 `script.md`。

策划稿应明确：保留哪些信息、屏幕文案、时间区间、事实不确定性，以及建议采用的表达方式。展示建议帮助 HTML 阶段理解意图，不是需要逐项照抄的组件清单。

### 2. 制作并预览 HTML

确认策划稿后，`ivh-create` 根据 [build.md](./ivh-create/build.md) 和风格 `spec.md` 制作单文件 HTML。默认画布为 1080×1440 的透明叠加素材。

本地打开 `script.html?view=1` 预览动画；用 `script.html?t=秒` 定位特定时刻。确认 HTML 效果后才进入渲染。

### 3. 渲染

从仓库根目录运行：

```bash
node ivh-render/scripts/render.mjs path/to/script.html
```

默认 `normal` 预设以 25fps 采样并输出 30fps CFR。透明 HTML 输出 ProRes 4444 MOV，并自动检查 alpha；只检查源码时加 `--preflight`。

```bash
node ivh-render/scripts/render.mjs path/to/script.html --preflight
node ivh-render/scripts/render.mjs path/to/script.html --preset draft
node ivh-render/scripts/render.mjs path/to/script.html --preset fine
```

渲染需要 Node.js、FFmpeg/FFprobe 和近期的 Chrome 或 Edge。详细参数和环境变量见 [ivh-render/SKILL.md](./ivh-render/SKILL.md)。

## 已验证能力

`bilibili-levels` 样例已从真实 SRT 完成完整流程：15 个定时卡片、透明 HTML、桌面与窄屏预览、代表帧检查、正常预设渲染和 alpha 抽检。

输出为 1080×1440、30fps、183.57 秒的 ProRes 4444 MOV。抽取 12 帧检查时，平均 73.66% 像素完全透明，确认透明通道有效。详细记录见 [ivh-create-plan.md](./docs/ivh-create-plan.md)。

## 后续工作

后续丰富都在当前框架内进行，不增加新的主流水线或组件注册系统。

1. 用内容结构不同的真实素材继续跑完整流程，验证共同表达指引的泛化能力。
2. 根据实际作品中重复出现的需求，补强已有风格的组件、布局和动效参考；一次性的画面选择保留在作品内。
3. 在需要时增加新风格：先写独立的 `spec.md`，再制作小样例验证，不修改共同表达指引的类型映射。
4. 只为重复且影响交付的问题增加自动检查，保持运行底座、文件格式和渲染接口简单稳定。
5. 当创作与渲染的独立调用确实变频繁时，再评估是否拆分 Skill 或扩展安装入口。

## 设计边界

- `script.md` 保留内容意图，`script.html` 负责视觉落地，`ivh-render` 只出片。
- 风格 MD 是模型的主要视觉依据；HTML 范例用于看效果、参考实现和复用运行底座。
- 组件提供一致性，不构成封闭的页面类型；模型可以组合、适配或新增符合风格的结构。
- 透明画布、时间定位、任意时刻定格和 `window.IVH.seekAt(t)` 是当前需要稳定遵守的工程约定。
