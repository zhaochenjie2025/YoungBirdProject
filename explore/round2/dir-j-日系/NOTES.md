# 方向 J · 日系极简 / 侘寂

## 参考与借用（这一轮的重点）
- 借自 React Bits `Masked Heading` / `Split Text`（文字揭示）——落地：页标题用 `overflow:hidden` 遮罩逐字从下 115% 升入，每字 46ms 错峰、0.86s 缓出曲线，故意慢到几乎察觉不到；内容块整体 `translateY(9px)` 柔和入场。
- 借自 React Bits `Curved Loop`（沿 SVG 曲线流动）——落地：今日主视觉是一把半圆弧尺，2400 千卡铺满半圆、每 20 千卡一根 3px 细刻、每 600 一根长刻带数字；1800–2200 参考区间是一段 6px 浅灰弧，当前值是一根朱红针。弧线只做刻度不承载数字，数字单独落在弧下——这是日式图版的「器 + 铭」分家。
- 借自 Magic UI `Dotted Map`（点语言）——落地：周视图 7 列 × 3 点（早/午/晚），实心=已记录、34% 半透=含估算、空心=未记录，今天背后一道朱红细竖线。点不复用图例形状就失去意义，故图例与点完全同形。
- 借自 Magic UI `Number Ticker`（数字滚动）——落地：每位数字一列 0–9 竖向 `translateY`，48ms/位错峰；首渲染直接定位不动，只在切换份量/切屏时滚动。只动 transform，未改宽度。
- 借自 Magic UI `Progressive Blur`——落地：底部坞上沿两层递增模糊（1.5px / 4px）各自 mask 渐隐，内容滚到坞后是溶解而非硬切断。
- 现实标杆：無印良品的包装分级（一条朱红、其余全是纸与墨）；原研哉《白》里「白是有层次的」——本页纸底 #F6F5F1、次层 #EDEBE4、发丝 #D9D6CE、正文墨 #1B1A17 四层同色系递进；《&Premium》的松字距与大行距。

## 核心母题（一句话）
**一页厨房量尺的记账纸**：弧尺量出今日份量，餐次像账本竖排的墨批，拍照是唯一一枚朱印。

## 三个关键工艺细节
1. **留白是算出来的**：尺 = 屏宽/3 = 130，寸 = 13，間 = 26（二寸）；左右边距恒为 26，纵向节奏走 13 的倍数；字阶 1.26 倍七级。360 宽时整组令牌等比降为 120/12/24，布局不重排。
2. **餐次标记是真竖排**：早/午/晚单字用 `writing-mode:vertical-rl`（衬线），时刻改为横排单行置于字下——竖排只给母语字，避免数字被直立排成怪形。
3. **朱印是刻的**：外缘 path 四边各带不齐、右下留一处刀口，`feTurbulence` 走 `feComposite in` 做印泥浓淡而非整片噪点，内圈一道不闭合细刻线。全站唯一实色，只出现在主操作与「此刻」标记。

## 性能取舍
单文件 47 KB（预算 120 KB）；零依赖、零网络、零位图。纸纤维是一张 120×120 的 `feTurbulence` data-URI，`mix-blend-mode:multiply` + 4.5% 不透明度固定铺在最上层；弧尺是纯内联 SVG 生成（约 120 根线）。动画只用 transform/opacity；`prefers-reduced-motion` 下揭示与滚动全部归零。

## 字体实测（本轮必答）
- 栈：`--f-serif: "Noto Serif CJK SC","Source Han Serif SC","Songti SC","STSong","Hiragino Mincho ProN","Noto Serif CJK JP",serif`；`--f-sans: -apple-system,"PingFang SC","Hiragino Sans GB","Noto Sans CJK SC",…`。
- 本机 CDP `CSS.getPlatformFontsForNode` 实测：`.mk-c`（竖排餐次字）落到 **Noto Serif CJK SC / NotoSerifCJKsc-Regular**；`.hd h1` 与正文落到 **Noto Sans CJK SC**。canvas 宽度探针确认衬线栈与 black 栈宽度不同（280 vs 280 相同是等宽 CJK，但拉丁字符 389.88 vs 358.04，证明确实换字）。
- Android 最坏情况：无 Noto Serif CJK、无宋体 → 落 `serif` → 通常是 Roboto Serif 或缺字回退到 Noto Sans CJK SC，**竖排餐次字会静默变黑体**。故衬线只用于 6 处单字/短语（不影响读数），所有数字与正文走无衬线栈，退化只损失一点「墨味」，不损失可读性。

## 质询迭代
见下（待质询后补）。
