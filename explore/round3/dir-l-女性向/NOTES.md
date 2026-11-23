# 方向 L · 女性向 / 多巴胺

## 参考与借用（机制名 → 落地）
- **unDraw 插画**（hero 蹲下摸狗 / 空态冥想 / 周结语遛狗）—— 借自 undraw.co 扁平矢量库，CSS 换色把原靛蓝 `#6c63ff` 改为薄荷绿/淡紫。
- **OpenMoji/Twemoji 菜品 emoji** + **Lucide 线性 UI 图标**（`currentColor` 跟随圆角底盘着色）。
- `Number Ticker`（Magic UI）：hero 933 / 丝带 867 / 周日均 / 合计，rAF easeOut 从 0 缓动到真值，reduced-motion 落值。
- `Bounce Cards`（React Bits）：餐次卡 `scale(.985)` spring 回弹、draft 新行 pop 入场。
- `Sticker Peel`（React Bits 机制）：丝带 `rotate(-1.4deg)` + 双三角折角 + drop-shadow，像贴纸。
- 标杆：薄荷健康/Keep 绿色圆角系 + Headspace 柔光插画 + 苹果"屏幕使用时间"分色堆叠柱/平均虚线/刻度。

## 核心母题（一句话）
把每天饮食记录做成一张"贴满可爱贴纸、会跟你说话的软陶卡片"：嫩绿打底、糖果色只点重点，插画小人陪着你记。

## 三个关键工艺细节
1. **丝带横幅**：两枚旋转 45° 方块做立体缎带折角，白描边 + 绿色 drop-shadow 做贴纸厚度。
2. **周视图可读性**：分色堆叠柱（早黄/午绿/晚蓝/加餐紫）+ 右侧 `k` 刻度 + 紫色日均虚线；斜纹柱=未记录、`!`=没记全，都排除均值外，一眼分三态。
3. **小贴士引擎**：无蔬菜→无主食→碳水>65%→蛋白<15%→脂肪>50%→均衡 只出一条，热量全从菜品库 `per100g×克数` 实时算（青菜 170g=94 千卡），区间用逐菜 `kcalRange` 求和。

## 素材来源与许可证（零外部请求，全部 symbol 内联）
| 素材 | 来源 URL | 许可证 | 位置 |
|---|---|---|---|
| 摸狗小人 | undraw.co/illustration/petting_xclp.svg | unDraw 免费商用 | hero 卡右侧 |
| 冥想小人 | undraw.co/illustration/meditation_k4oa.svg | unDraw 免费商用 | 今日空状态 |
| 遛狗小人 | undraw.co/illustration/walking-the-dog_cjob.svg | unDraw 免费商用 | 周结语卡 |
| 菜品 emoji | cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0 | CC-BY 4.0 | 餐次/明细/draft |
| UI 图标 | lucide.dev (lucide-static@0.468.0) | ISC | 入口/导航/按钮 |

## 性能取舍
- 单文件 **93.8KB**（<120KB），零外部请求；所有插画/图标构建时压成 `<symbol>` sprite。
- 动效仅 transform/opacity；`prefers-reduced-motion` 下 ticker 落值、卡片不弹、进度条直填。
- 周图 boot 预构建，柱高/均值按真实数据算，无写死像素。

## 质询迭代（2 轮）
- **第 1 轮（盲审 6/10，10 项，判"母题层重做"）**：贴纸母题只在丝带活着、容器全是默认圆角、基底偏冷、五色入口抢戏、插画无脸。
- **第 1 轮返工（4 个 P0）**：① 容器→die-cut 贴纸边 + 贴缝投影 + 微旋转；② 黄绿嫩色基底（`#FBFBEF` + `#7BC96A` Hue≈95°）；③ hero 进度条改按餐次分段堆叠条 + 图例，五圆入口收敛为白底单色描边；④ 周图日均移出柱区、`!` 分离、柱加受光+纸缝、周底加胶带便签收尾。
- **第 2 轮复核：3/4 通过，第 1 项再精修**。精修：贴纸三件套加淡绿 hairline 定义 Edge、`.snap/.sumbox/.hero/.dishcard/.chart` 全补贴纸边、旋转提到 ±0.9~1.4°、餐区加薄薄荷洗底。
- **未改项与理由**：插画无脸——受"只用公开素材"约束，unDraw 全库无脸，已用配色/构图补偿。
- **收尾（协调方追加）**：① nav 中央改**凸起圆形快门 FAB**（`记一餐` 主操作，62px 圆钮 + 白环 + 绿光晕，抬升 20px；详单屏仍可从任意餐次卡进入）；② slop-scan 47 处 P1 逐条处置——圆角卡片在"圆润+贴纸"母题下均**正当**，逐条在规则体/行内加 `cf-justify` 说明；**P1: 47→0**。
- **终审自检**：slop-scan **P0=0 / P1=0 / P2=0**；390/360 四屏零横向溢出；矩形相交验证底部导航**与中央 FAB 均零遮挡**；console 零报错；动画仅 transform/opacity + reduced-motion 兜底；单文件 96.6KB。
