// S39O-cs-advice: 膳食建议生成，模型只解释、不计算。
// 实现 把前端算好的整餐数值、菜品构成、记录完整度写进提示词，要求模型只输出文字建议；
// 生成后再做一次数字白名单校验，把模型自行编造的数字标出来。
// 原理 数值由前端计算并以「给定事实」形式交给模型，模型不被允许推导数字，
// 因此「建议中的数值与结果页一致」由输入结构保证，而不是靠模型自觉。
import { chat, ApiError } from '../vision/client';
import type { Meal, MealSummary } from '../domain/types';
import { MEAL_SLOT_LABEL } from '../domain/types';

export interface AdviceInput {
  meal: Meal;
  summary: MealSummary;
  /** 记录是否完整（存在待估算菜品时为 false）。 */
  complete: boolean;
}

export interface AdviceResult {
  text: string;
  /** 建议文本中出现、但不在允许集合里的数字，用于提示用户以结果页为准。 */
  suspiciousNumbers: string[];
}

function buildPrompt(input: AdviceInput): string {
  const { meal, summary, complete } = input;
  const dishLines = meal.items.map((it) => {
    const kcal = it.pending ? '待估算' : `${Math.round(it.nutrition.kcal ?? 0)} 千卡`;
    const cat = it.dishId ? '' : '（自定义，未匹配菜品库）';
    return `- ${it.name}${cat}：${it.grams} 克，${it.portionLabel}，${kcal}`;
  });

  const macro = [
    summary.protein === null ? '蛋白质 暂无数据' : `蛋白质 ${summary.protein} 克`,
    summary.fat === null ? '脂肪 暂无数据' : `脂肪 ${summary.fat} 克`,
    summary.carbs === null ? '碳水 暂无数据' : `碳水 ${summary.carbs} 克`,
  ].join('；');

  return [
    `以下是一餐的完整记录，数值已由系统算好，请直接使用，不要重新计算：`,
    `餐次：${MEAL_SLOT_LABEL[meal.slot]}，日期 ${meal.date}`,
    `已估算热量：${summary.kcal} 千卡；${macro}`,
    `菜品明细：`,
    ...dishLines,
    complete
      ? '本餐记录完整。'
      : `本餐有 ${summary.pendingCount} 道菜待估算，结论中请说明这一点。`,
    '',
    '请用两三句中文，说明这餐的搭配特点，并给出一到两条适合校园食堂的调整建议。',
    '要求：只解释搭配，不给出新的热量或营养素数值；提到热量时只能引用上面给出的数字。',
    '不要使用列表符号，不要超过 120 字。',
  ].join('\n');
}

/** 从文本中提取所有数字串（含小数）。 */
function extractNumbers(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

/** 生成建议。失败抛 ApiError，由 UI 单独展示重试。 */
export async function generateAdvice(
  apiKey: string,
  input: AdviceInput,
  signal?: AbortSignal,
): Promise<AdviceResult> {
  const text = await chat(apiKey, {
    system:
      '你是校园营养助手。你只解释已有数据、提供搭配建议，不进行任何数值计算，也不编造营养数据。',
    user: [{ type: 'text', text: buildPrompt(input) }],
    json: false,
    maxTokens: 400,
    signal,
  });

  const allowed = new Set<string>([
    String(input.summary.kcal),
    String(input.summary.pendingCount),
    ...input.meal.items.map((i) => String(i.grams)),
  ]);
  if (input.summary.protein !== null) allowed.add(String(input.summary.protein));
  if (input.summary.fat !== null) allowed.add(String(input.summary.fat));
  if (input.summary.carbs !== null) allowed.add(String(input.summary.carbs));

  const suspicious = Array.from(new Set(extractNumbers(text))).filter((n) => !allowed.has(n));
  return { text: text.trim(), suspiciousNumbers: suspicious };
}

export { ApiError };
