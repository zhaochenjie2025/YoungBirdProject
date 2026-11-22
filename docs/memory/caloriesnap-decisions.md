---
name: caloriesnap-decisions
description: CalorieSnap 的关键技术决策与理由，后续改动前先读
metadata:
  type: project
---

# CalorieSnap 关键决策（2026-11-23）

## 识别方案：多模态模型封闭选择，不训练分类器

原计划是训练 MobileNet + ONNX 本地推理。实测 DeepSeek 的 `deepseek-flash` 支持图像理解、
浏览器可直连（CORS 已放开）、单次识别约 2 厘钱后改为调用多模态模型。

**Why**：训练方案要 500 张训练图 + 标注 + 量化 + 10MB 模型首次加载，工作量和风险都高一个数量级；
改用模型后 500 张图从「训练数据」降级为「评测数据」，正好对上 PRD 里那三个指标的验收用途。

**How to apply**：识别提示词里必须放完整菜品目录，模型只返回 `dishId`，前端按 ID 查库，
查不到的丢弃。不要退回「让模型自由回答菜名」——那样会编出库里没有的菜。

## 只有 deepseek-flash 支持图像

`deepseek-v4-pro` 不支持图像理解。模型名在 `src/vision/client.ts` 的 `MODEL` 常量里。

## 思考模式必须显式关闭

DeepSeek 的 `thinking` **默认开启**，不关会让识别延迟翻数倍。每次请求都必须带
`thinking: { type: 'disabled' }`，集中在 `src/vision/client.ts` 一处，别在别处另写调用。

## 建议是「前端算数、模型解释」

PRD 要求建议里的热量与结果页一致。做法不是让模型自己算，而是把算好的数值当给定事实喂进去，
并明确禁止重新计算；渲染上数值由前端组件显示，模型只输出文字。

## 视觉探索四方向并行（2026-11-23）

按 Sou39O 要求「视觉与功能逻辑并行探索、3~4 个方向」，同时开拍立得/仪表盘/层叠/手账四个方向，
产物在 `explore/`，不参与构建。方向定稿后只需替换 `src/styles/global.css` 的令牌即可换肤。

## 测试数据来自 Wikimedia Commons

真实食堂照片尚未采集，用公开图片先验证链路。**标注错误的样本会把锅算到模型头上**——
第一次跑出 73.7% 时，5 个未命中里 4 个是标注错误（生大米被标成米饭、刈包被标成红烧肉等），
经审计后干净子集是 13/13。

**How to apply**：任何准确率数字报出来之前，先用 `data/vision-test/audit.json` 核对标注质量。

## 生产端点尚未联调

本机没有 DeepSeek API key。识别与建议只在本地网关（Anthropic 格式）验证过；
`api.deepseek.com` 的 OpenAI 格式路径（含 `response_format: json_object` 与 `thinking` 扩展字段）
尚未用真实 key 跑通。拿到 key 后第一件事是跑 `tools/vision-eval.ts`（不设 CS_GATEWAY）。
