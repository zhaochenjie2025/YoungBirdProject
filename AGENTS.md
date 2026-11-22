# CalorieSnap 项目规则（agent 入口）

卡路里拍立得：北邮食堂饮食记录，纯前端 SPA，托管 GitHub Pages。
PRD 原文在 `docs/PRD.md`。

## 先读什么

1. 本文件（项目特有规则）
2. `docs/Semantics.md` —— 语义索引，改代码前查
3. `docs/memory/MEMORY.md` —— 项目决策记忆
4. 跨项目语义索引规范：`~/.claude/docs/SEMANTICS-SPEC.md`（不复制到本仓）

## 标记与索引

- 代码里只有一种标记：`S39O-cs-<ID>: <说明>`，首行。ID 统一小写 `cs-` 前缀（校验器 ID 规则只认小写）。
- 每个 ID 在 `docs/Semantics.md` 有一条；格式严格照通用规范。
- 检索一律 `grep -F`：

```bash
grep -nF '关键词' docs/Semantics.md          # 1. 确认概念
grep -rnF 'S39O-cs-<ID>:' src                # 2. 按 ID 跳转
npm run check:semantics                      # 3. 校验
```

- `docs/Semantics.md` 不进格式化工具（`.prettierignore` 已排除）。

## 校验命令

| 命令 | 作用 |
|---|---|
| `npm run check:semantics` | 索引与代码标记一致性 |
| `npm run check:dishes` | 菜品库 schema 与必填出处 |
| `npm run typecheck` | TypeScript |
| `npm run test` | 单元测试 |
| `npm run verify` | 以上全部 + 构建 |

## 硬性技术约束

- **纯静态**：无服务端、无 SSR、无 Node 运行时依赖进产物。
- **路由用 hash**：`#/today`、`#/meal/new`、`#/history`、`#/week`。GitHub Pages 无重写规则。
- **存储只在本机**：localStorage，键 `caloriesnap:data:v1`。不存照片，只存菜名/克数/营养快照。
- **营养计算在前端**：数值只能由 `src/domain/nutrition.ts` 从菜品库算出。大模型不许算数，只许解释。
- **API key 由用户提供**：存 sessionStorage（默认）或 localStorage（用户选择）。永远不进 URL、不进日志。
- **零第三方脚本**：不引入统计、CDN 字体、外部组件库。CSP 已在 `index.html` 限制 `connect-src`。
- **移动优先**：设计基准 390×844（iPhone 12/13 逻辑像素），必须适配 360 宽窄屏与安全区。
- **性能预算**：首屏 JS（gzip）≤ 120 KB；LCP ≤ 2.5s（4G 模拟）。

## 识别与建议（DeepSeek）

- 模型：`deepseek-flash`（当前唯一支持图像理解的模型）。
- 端点：`https://api.deepseek.com/v1/chat/completions`，OpenAI 兼容格式。
- **必须显式关闭思考模式**：`thinking: { type: 'disabled' }`。不关则延迟翻数倍。
- 识别用 `detail: 'low'`（512×512），`response_format: { type: 'json_object' }`。
- 识别是**封闭选择**：提示词里给完整菜品目录，模型只返回 `[{ dishId, confidence }]`，前端按 ID 查库。查不到即丢弃。
- 建议调用与识别共用同一个 HTTP 客户端，只换提示词。

## 目录

```
src/domain/     纯函数：营养计算、统计、餐食模型。无 React 依赖，全部单测覆盖
src/data/       菜品库 JSON + 搜索
src/store/      localStorage 持久化 + schema 迁移
src/vision/     识别客户端（provider 接口 + deepseek 实现）
src/advice/     建议客户端
src/pages/      页面组件
src/components/ 共享组件
src/styles/     全局样式与设计令牌
tools/          校验脚本、冒烟测试（不进产物）
explore/        视觉探索产物（不进产物，可 gitignore 截图）
docs/           PRD、语义索引、项目记忆
```
