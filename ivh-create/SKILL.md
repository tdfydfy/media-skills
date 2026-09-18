---
name: ivh-create
description: 根据视频、音频、SRT 或文稿策划并制作动画 HTML。支持为已有主体视频制作透明叠加素材，以及围绕已有音频制作含主叙事、B-roll、背景、标题和演示的完整无声视频画面。已有 HTML 仅需导出时使用 ivh-render。
---

# 视频画面创作

先按产物用途选择模式，再从用户已有进度继续。只读取所选模式的文档。

| 用途 | 模式入口 |
|---|---|
| 原视频承担主体，新增重点卡片、数字、流程等辅助画面 | [透明素材 workflow](modes/overlay/workflow.md) |
| 围绕音频安排全程画面，自己承担完整视觉叙事，之后与原音频分别放入剪辑软件 | [独立视频 workflow](modes/standalone/workflow.md) |
| 已有 HTML，只需导出视频 | 相邻目录的 [ivh-render](../ivh-render/SKILL.md) |

独立模式默认交付无声视频；是否有声音、是否使用透明层都不是模式的唯一判据。用途不明确且会改变交付时才询问，已有模式与确认直接沿用。

所选模式的 workflow.md 规定输入、输出和阶段衔接：原始材料进入 creation.md，已确认策划稿进入 build.md，修改意见回到当前产物，效果确认且已要求出片后交给 ivh-render。遵循用户已授权的连续执行范围，不重复请求确认。

两个模式共享 [soft-relief](styles/soft-relief/spec.md) 与 [neon-terminal](styles/neon-terminal/spec.md) 等风格参考。风格是设计依据，组件是候选；独立模式的全屏布局、明暗对比和素材处理以其 build 指引为准。
