// S39O-cs-recognize: 单菜照片识别，把图片变成菜品库内的候选列表。
// 实现 先在浏览器把图缩到 512 长边并压成 JPEG，再把完整菜品目录放进提示词要求模型返回 dishId 候选，
// 最后按 ID 回查菜品库，库里没有的候选丢弃。
// 原理 识别做成「封闭选择」而不是自由命名，模型只能在给定 ID 中挑，从结构上杜绝编造菜品；
// 目录顺序固定，使提示词前缀可以命中上游缓存，单次成本降到分位。
import { chat, parseJsonLoose, ApiError } from './client';
import { buildCatalogPrompt, getDish } from '../data/dishes';
import type { Dish } from '../domain/types';

export interface Candidate {
  dish: Dish;
  confidence: number;
}

export interface RecognizeResult {
  candidates: Candidate[];
  /** 模型原始输出的候选数（含被丢弃的），用于诊断识别退化。 */
  rawCount: number;
}

/** 图片压缩目标：长边 512，质量 0.8。返回可直接发给模型的 data URL。 */
export async function downscaleImage(file: File, maxEdge = 512): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new ApiError('request', '浏览器不支持图片处理');
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}

export function buildSystemPrompt(): string {
  return [
    '你是校园食堂的菜品识别助手。用户会给你一张单道菜的照片。',
    '你只能从下面的菜品目录中选择，不得创建目录之外的菜名。',
    '目录格式：id | 标准名 | 别名 | 烹饪方式 | 类别',
    '',
    buildCatalogPrompt(),
    '',
    '只输出 JSON，格式为 {"candidates":[{"dishId":"目录中的id","confidence":0到1之间的小数}]}。',
    '最多 3 个候选，按可能性从高到低排列。',
    '如果照片里看不出是目录中的任何一道菜，返回 {"candidates":[]}。',
  ].join('\n');
}

/** 识别一张图片，返回按置信度降序的候选。网络/密钥类错误抛 ApiError 由 UI 分支处理。 */
export async function recognizeDish(
  apiKey: string,
  imageDataUrl: string,
  signal?: AbortSignal,
): Promise<RecognizeResult> {
  const text = await chat(apiKey, {
    system: buildSystemPrompt(),
    user: [
      { type: 'text', text: '识别这张照片里的菜。' },
      { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
    ],
    json: true,
    maxTokens: 300,
    signal,
  });

  const parsed = parseJsonLoose<{ candidates?: Array<{ dishId?: unknown; confidence?: unknown }> }>(text);
  const list = Array.isArray(parsed.candidates) ? parsed.candidates : [];

  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const c of list) {
    if (typeof c?.dishId !== 'string' || seen.has(c.dishId)) continue;
    const dish = getDish(c.dishId);
    if (!dish) continue; // 库里没有的 ID 直接丢弃
    seen.add(c.dishId);
    const conf = typeof c.confidence === 'number' && Number.isFinite(c.confidence)
      ? Math.min(1, Math.max(0, c.confidence))
      : 0;
    candidates.push({ dish, confidence: conf });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return { candidates: candidates.slice(0, 3), rawCount: list.length };
}
