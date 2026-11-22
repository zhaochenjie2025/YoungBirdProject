// S39O-cs-advice: 膳食建议生成，模型只解释、不计算。
// 实现 把前端算好的数值与菜品构成写进提示词，要求模型只输出文字；
// 生成后做数字白名单校验，把模型自行编造的数字标出来。支持单餐与单日两种范围。
// 原理 数值由前端计算并以「给定事实」形式交给模型，模型不被允许推导数字，
// 因此「建议中的数值与结果页一致」由输入结构保证，而不是靠模型自觉。
import { chat, ApiError } from '../vision/client';
import type { Meal, MealSummary, DayStats } from '../domain/types';
import { MEAL_SLOT_LABEL } from '../domain/types';

export interface AdviceInput {
  meal: Meal;
  summary: MealSummary;
  /** 记录是否完整（存在待估算菜品时为 false）。 */
  complete: boolean;
}

/** 单日建议：把当天所有餐食合并成一份输入。 */
export interface DayAdviceInput {
  date: string;
  meals: Meal[];
  stats: DayStats;
  complete: boolean;
}

export interface AdviceResult {
  text: string;
  /** 建议文本中出现、但不在允许集合里的数字，用于提示用户以结果页为准。 */
  suspiciousNumbers: string[];
}

function macroText(protein: number | null, fat: number | null, carbs: number | null): string {
  return [
    protein === null ? '蛋白质 暂无数据' : `蛋白质 ${protein} 克`,
    fat === null ? '脂肪 暂无数据' : `脂肪 ${fat} 克`,
    carbs === null ? '碳水 暂无数据' : `碳水 ${carbs} 克`,
  ].join('；');
}

function itemLine(it: Meal['items'][number]): string {
  const kcal = it.pending ? '待估算' : `${Math.round(it.nutrition.kcal ?? 0)} 千卡`;
  const cat = it.dishId ? '' : '（自定义，未匹配菜品库）';
  return `- ${it.name}${cat}：${it.grams} 克，${it.portionLabel}，${kcal}`;
}

function buildMealPrompt(input: AdviceInput): string {
  const { meal, summary, complete } = input;
  return [
    '以下是一餐的完整记录，数值已由系统算好，请直接使用，不要重新计算：',
    `餐次：${MEAL_SLOT_LABEL[meal.slot]}，日期 ${meal.date}`,
    `已估算热量：${summary.kcal} 千卡；${macroText(summary.protein, summary.fat, summary.carbs)}`,
    '菜品明细：',
    ...meal.items.map(itemLine),
    complete ? '本餐记录完整。' : `本餐有 ${summary.pendingCount} 道菜待估算，结论中请说明这一点。`,
    '',
    '请用两三句中文，说明这餐的搭配特点，并给出一到两条适合校园食堂的调整建议。',
    '要求：只解释搭配，不给出新的热量或营养素数值；提到热量时只能引用上面给出的数字。',
    '不要使用列表符号，不要超过 120 字。',
  ].join('\n');
}

function buildDayPrompt(input: DayAdviceInput): string {
  const { date, meals, stats, complete } = input;
  const lines: string[] = [];
  for (const m of meals) {
    lines.push(`${MEAL_SLOT_LABEL[m.slot]}（${m.time}）：`);
    lines.push(...m.items.map(itemLine));
  }
  return [
    `以下是 ${date} 这一天的全部饮食记录，数值已由系统算好，请直接使用，不要重新计算：`,
    `全天已估算热量：${stats.kcal} 千卡；${macroText(stats.protein, stats.fat, stats.carbs)}`,
    `共记录 ${stats.mealCount} 餐，菜品明细：`,
    ...lines,
    complete
      ? '当天记录完整。'
      : `当天有 ${stats.pendingCount} 道菜待估算，结论中请说明这一点。`,
    '',
    '请用三句中文，回顾这一天的搭配，并给出一到两条适合校园食堂的调整建议。',
    '要求：只解释搭配，不给出新的热量或营养素数值；提到数值时只能引用上面给出的数字。',
    '不要使用列表符号，不要超过 140 字。',
  ].join('\n');
}

/** 从文本中提取所有数字串（含小数）。 */
export function extractNumbers(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

/** 校验建议文本里的数字是否都在允许集合内。 */
function checkNumbers(text: string, allowedValues: Array<number | null>, grams: number[]): string[] {
  const allowed = new Set<string>([...grams.map(String)]);
  for (const v of allowedValues) if (v !== null) allowed.add(String(v));
  return Array.from(new Set(extractNumbers(text))).filter((n) => !allowed.has(n));
}

const SYSTEM =
  '你是校园营养助手。你只解释已有数据、提供搭配建议，不进行任何数值计算，也不编造营养数据。';

/** 生成单餐建议。失败抛 ApiError，由 UI 单独展示重试。 */
export async function generateAdvice(
  apiKey: string,
  input: AdviceInput,
  signal?: AbortSignal,
): Promise<AdviceResult> {
  const text = await chat(apiKey, {
    system: SYSTEM,
    user: [{ type: 'text', text: buildMealPrompt(input) }],
    json: false,
    maxTokens: 400,
    signal,
  });

  const suspicious = checkNumbers(
    text,
    [input.summary.kcal, input.summary.pendingCount, input.summary.protein, input.summary.fat, input.summary.carbs],
    input.meal.items.map((i) => i.grams),
  );
  return { text: text.trim(), suspiciousNumbers: suspicious };
}

/** 生成单日建议。失败抛 ApiError。 */
export async function generateDayAdvice(
  apiKey: string,
  input: DayAdviceInput,
  signal?: AbortSignal,
): Promise<AdviceResult> {
  const text = await chat(apiKey, {
    system: SYSTEM,
    user: [{ type: 'text', text: buildDayPrompt(input) }],
    json: false,
    maxTokens: 460,
    signal,
  });

  const suspicious = checkNumbers(
    text,
    [input.stats.kcal, input.stats.pendingCount, input.stats.protein, input.stats.fat, input.stats.carbs],
    input.meals.flatMap((m) => m.items.map((i) => i.grams)),
  );
  return { text: text.trim(), suspiciousNumbers: suspicious };
}

export { ApiError };
