# 方向 E · 现代简约 / 洁净明亮

## 参考与借用（这一轮的重点）
- 借自 Magic UI `Progressive Blur`：多层递增 blur + 线性 mask 逐层收窄。落地：顶部标题栏与底部 Dock 上下各 4 层（1/5/13/26px）叠色，内容滚过边缘是"溶解"而非被硬边切断。
- 借自 Magic UI `Number Ticker` + React Bits `Count Up`：逐位数字滚动。落地：今日主卡 585 用竖向滚筒（每位一列 0–9，逐列 70ms 错峰落位），本餐合计与结果页计数用短程 ticker，均只动 transform。
- 借自 Magic UI `Bento Grid`（非对称宫格）+ `Animated List`：周视图 7 天在 6 列网格里按 3/3/2/2/2/3/3 错位排布，不做等宽七格；新建页菜品行增删用 opacity/translate/scale 的进场与离场动画，删除先出后重排。
- 借自 React Bits `Dock` + `Rubber Segment`：Dock 选中胶囊按实际项宽滑移（弹簧曲线 cubic-bezier(.26,1.3,.36,1)）；份量三选一做成 iOS 式分段控件，选中块浮起带内高光。
- 标杆参照：Apple iOS 26 Liquid Glass（浮层玻璃 + 镜面高光 + spring 曲线，非 ease）、Linear（1px 发丝边、内顶高光、极克制灰阶）、Vercel/Stripe Dashboard（大留白与清晰数据层级）。

## 核心母题（一句话）
**一张干净、可信的测量工具界面**：内容层是哑光纸面（发丝边 + 内顶受光 + 双层软影），只有"浮起来的东西"——底部导航、滚动中的标题栏、合计条——才用玻璃；玻璃不铺满页面，因为玻璃叠玻璃会互相脏化。

## 三个关键工艺细节
1. **纸面光泽与玻璃镜面两套材质各司其职**：纸面卡统一 `linear-gradient(176deg,#FFF→#FBFAF8)` 微受光 + `inset 0 1px 0 #fff` 顶缘高光；玻璃层另叠一道 112° 斜向白高光（screen 混合），这是液态玻璃"有点反光"的关键。
2. **数字滚筒而非位图数字**：`mask-image` 只保留字形中间 95%，两端 5% 渐隐让滚动的进位边不露头；列间 transition-delay 制造机械落位的参差。
3. **区间条是"测量仪器"的读数**：番茄炒蛋/青菜/米饭的区间用一根细轨 + 半透明区间带 + 实体圆点标注折算值，下方三处刻度对齐，直接回答 PRD 里"为什么是 189 而不是 178"。

## 性能取舍
零依赖、零网络、零位图：图标与纹理全为内联 SVG，纸纹用 140×140 feTurbulence data-URI 一次生成、`mix-blend-mode:multiply` 极低不透明度叠压。动画只用 transform/opacity；`prefers-reduced-motion` 下全部动画归零。单文件约 66 KB（<120 KB）。

## 质询迭代（2 轮 haiku 盲审）
（待填）
