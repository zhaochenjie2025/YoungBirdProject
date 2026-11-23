---
name: critic-must-load-skill
description: 派 s39o-aesthetic-critic 时必须要求它先加载 creative-frontend 技能，否则质询只是多一层审查而非多一层标准
metadata:
  type: feedback
---

派 `s39o-aesthetic-critic` 时，**必须在提示词最前面写死要求它加载 `creative-frontend` 技能并读三份 references**（`scaffolds-and-refs.md`、`craft-and-perf.md`、`review-checklist.md`）。2026-11-23 在 CalorieSnap 视觉探索中由 Sou39O 指出。

**Why**：质询代理的定义文件里只有一句「必要时可点名参考库机制」，是可选提示、不是强制步骤。不加载技能时，它按自己的审美感觉审，产出的是泛泛评价（"工艺密度不够""这个不够好"），等于**多了一层审查但没有多一层标准**。加载技能后，它能用工艺密度要求、3D 精度线、Sou39O 的品味原话当标尺，并且每条必改都点名具体组件机制。

实测差别（同一个方向、同一档位 haiku）：

| 无技能 | 有技能 |
|---|---|
| "材质不够真实" | "金属环是线性渐变，缺随弧移动的镜面热点——应改角向 26 段配色" |
| "布局一般" | "面板与纸带是两张独立卡，谁都不是机身——结构层缺失" |
| 没发现 | "主操作被固定页脚压掉，390 宽压 38px、360 宽压 91px"（可达性事故） |
| 没发现 | "手写体栈前四项全是 macOS 字体，Linux/Android 静默降级，手写感是假的" |
| 没发现 | "周边码用了 KODAK 5222 商标 + CNS 假编号"（踩去冗红线） |

**How to apply**：给质询代理的 prompt 开头固定放这段模板——

```
## 必做第一步（在你的裁决之前完成）
1. 调用 Skill 工具加载 `creative-frontend`
2. 读 ~/.claude/skills/creative-frontend/references/scaffolds-and-refs.md
3. 读 ~/.claude/skills/creative-frontend/references/craft-and-perf.md
4. 读 ~/.claude/skills/creative-frontend/references/review-checklist.md

你的裁决必须以上述文件里的工艺密度标准、3D 精度线、Sou39O 审美品味原话校准为标尺，
给出升维方向时必须点名参考库里具体的组件机制，不能只凭个人感觉。
```

之后才是截图路径、slop-scan 输出、母题、借用的机制清单。隔离盲审原则不变——不喂作者辩解。

相关：[[caloriesnap-decisions]]、[[vision-directions]]
