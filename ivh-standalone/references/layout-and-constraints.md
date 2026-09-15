# 布局族与安全边距

---

## 一、四种比例（`RATIO`）

| `RATIO` | 画布 | 家族 | 典型场景 |
|---|---|---|---|
| `16:9` | 1920×1080 | 横版 | 会议投屏、B 站 / 视频号横屏 |
| `9:16` | 1080×1920 | 竖版 | 抖音 / 快手 / 视频号竖屏 |
| `4:3` | 1440×1080 | 横版 | 老设备投屏、PPT 嵌入 |
| `3:4` | 1080×1440 | 竖版 | 小红书 / 图文封面 |

**同一部片子只用一种比例。** 模板按 `data-ratio` 切换整套布局规则。

---

## 二、安全边距

```css
html[data-ratio="16:9"] #stage,
html[data-ratio="4:3"]  #stage{ --pad-x:96px; --pad-y:76px; }

html[data-ratio="9:16"] #stage,
html[data-ratio="3:4"]  #stage{ --pad-x:72px; --pad-y:180px; }
```

**竖版为什么上下留 180px**：手机竖屏有平台 UI（顶部状态栏、底部评论/进度条），
内容不能贴边。横版没有这个问题，四周留白小一些。

---

## 三、组件定位：居中 + 分带

独立成片**没有避让约束**（画面自己扛叙事，不存在"要避开谁"），所以：

```css
/* 默认：居中构图 */
html[data-purpose="standalone"] .comp{
  left:0; right:0; top:0; bottom:0; margin:auto;
  width:fit-content; height:fit-content;
  max-width:76%;
}

/* A-roll：上半带；B-roll：下半带 */
html[data-purpose="standalone"] .comp[data-roll="A"]{ bottom:58%; }
html[data-purpose="standalone"] .comp[data-roll="B"]{ top:44%;  }
```

**为什么用 `inset:0 + margin:auto` 而不是 `transform:translate(-50%,-50%)`**：
入场动效的关键帧会写 `transform`（`translateY` / `scale`）。
如果用 `transform` 做居中，动画一结束元素就会**跳位**。

### `max-width` 的作用

**不是**"防侵占中央"（那是整屏叠加才有的需求）——
独立成片里，`max-width:76%` 只用来防止组件铺满整屏、左右贴边。

> **注意**：`max-width` 只在 `.comp` 上生效。幕内元素（`.h1` / `.c-bar` 等）
> 由幕的 `padding` 控制，不需要额外约束。

---

## 四、竖版重排

竖版横向空间窄，横排的组件要改成纵排：

| 组件 | 横版 | 竖版 |
|---|---|---|
| `c-vs`（对比卡） | 横排 `A ≠ B` | 换 `c-cmp`（上下两块） |
| `c-step`（步骤） | 等宽并列 | 换 `c-stack`（阶梯堆叠） |
| `c-ring`（环形） | 居中 | 自动改纵排（环上 / 说明下） |
| `--fs-num`（数字字号） | 190px | 140px（9:16）/ 158px（3:4） |

**判断法**：拿笔在纸上按画布比例画一画。横排两块在 1080 宽里会被挤成窄条。

---

## 五、六风格的布局指纹

六风格不只是换色 —— 每种风格有自己的**结构层**差异（第 8 项自检会查）：

| 风格 | 结构指纹 |
|---|---|
| `doodle` | 手绘描边、微旋、纸张纹理 |
| `riso` | 套印错版（双色偏移阴影）、网点 |
| `blueprint` | 虚线轮廓、计数器编号、网格 |
| `minimal` | 发丝分隔线、无阴影、无圆角 |
| `neon` | 切角面板、发光、扫描线 |
| `pixel` | 阶梯硬边、点阵、跳帧动效 |

完整规格见 `visual-styles.md`。

---

## 六、硬约束

| 约束 | 判据 |
|---|---|
| 单文件零依赖 | 无 http 引用、无外链、无 `@import`（第 2 项） |
| `:root` 变量齐备 | 12 个核心变量（第 3 项） |
| 六风格结构可区分 | 各自有专属 keyframes（第 8 项） |
| 组件 `max-width` | `.comp` 规则块必须带（防铺满） |
| 幕有 `data-sec` | 每幕都要（第 10 项） |
| 停留 ≥0.8s | 每个组件（第 9 项） |
| 提示标签 ≤6 字 | `c-capsule`（第 11 项） |
| 信息卡 ≤14 字/行 | 超 42 字硬 FAIL（第 11 项） |
