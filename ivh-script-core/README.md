# ivh-script-core —— 脚本阶段的共享层

**这不是一个 Skill。** 本目录**没有 `SKILL.md`**，所以不会被宿主当成技能加载。
它是两个脚本技能共用的**契约与工具**，靠相对路径被引用。

```
ivh-script-standalone/  ─┐
                         ├─→  ../ivh-script-core/…
ivh-script-overlay/     ─┘
```

## 里面是什么

| 文件 | 用途 | 谁读 |
|---|---|---|
| `script-format.md` | **JSON 契约**：字段定义 + 8 条硬校验 + `contentType` 分档 | 两个脚本技能 + 两个下游技能 |
| `text-layers.md` | 三层文本写法：口播稿 / 信息卡 / 提示标签 + 锚点机制 | 两个脚本技能 |
| `distillation.md` | 提炼法：压缩链、主张四检验、钩子、候选法 | 两个脚本技能 |
| `chart-choices.md` | 15 个组件（`c-*`）的选型索引 | 两个脚本技能 |
| `scripts/parse-srt.mjs` | SRT → 时间轴；`--candidates` 出候选句、`--content` 换规则集、`--anchor` 选入点 | 两个脚本技能 |
| `scripts/check-script.mjs` | 契约校验器；`--stamp` 盖校验凭据 | 两个脚本技能 + 两个下游技能（验章） |

## 为什么要有这一层

唯一的共享面只能有一个物理副本 —— 同名文件各存一份必然漂移
（本仓库实测过三次，见仓库根 `README.md`）。

- 想改契约、改校验器、改编排工具 → **改这里**，两条支线同时生效。
- 想改某条支线怎么写内容 → 改那条支线的 `SKILL.md` 与 `references/`。

同一套做法已在 ②③④ 复用，见 `../ivh-html-core/README.md`。

## 引用方式

```bash
# 校验（两条支线同一份校验器，按 meta.purpose 自动分支）
node ../ivh-script-core/scripts/check-script.mjs 脚本.json --stamp

# 提候选句
node ../ivh-script-core/scripts/parse-srt.mjs 字幕.srt 时间轴.json --candidates --content drama
```

> **安装提示**：`ivh-*-core` 必须与其余技能放在同一个父目录下 —— 靠 `../` 相对引用。
> 安装脚本见仓库根 `README.md`。
