// S39O-cs-nutrition: 营养计算核心，把「菜品库条目 + 实吃克数」算成营养值。
// 实现 按 100 克基准做线性缩放，任何输入字段缺失即输出 null；提供热量区间换算与汇总。
// 原理 所有数值都从组件字段现算、不做四舍五入累加，避免「先舍入再相加」的偏差累积；
// 缺失值一路传播为 null，使「待估算」状态无需额外标记就能被上层识别。
import type { Nutrition, Dish, MealItem, MealSummary } from './types';

/** 四舍五入到整数千卡 / 一位小数克。展示与存储都走这里，保证同一数值处处一致。 */
export function roundNutrition(n: Nutrition): Nutrition {
  return {
    kcal: n.kcal === null ? null : Math.round(n.kcal),
    protein: n.protein === null ? null : Math.round(n.protein * 10) / 10,
    fat: n.fat === null ? null : Math.round(n.fat * 10) / 10,
    carbs: n.carbs === null ? null : Math.round(n.carbs * 10) / 10,
  };
}

/** 把每 100 克营养值按实际克数缩放。任一字段为 null 时该字段保持 null。 */
export function scaleNutrition(per100g: Nutrition, grams: number): Nutrition {
  if (!Number.isFinite(grams) || grams <= 0) {
    return { kcal: null, protein: null, fat: null, carbs: null };
  }
  const f = grams / 100;
  return {
    kcal: per100g.kcal === null ? null : per100g.kcal * f,
    protein: per100g.protein === null ? null : per100g.protein * f,
    fat: per100g.fat === null ? null : per100g.fat * f,
    carbs: per100g.carbs === null ? null : per100g.carbs * f,
  };
}

/** 是否为待估算条目：热量数据缺失即视为待估算。 */
export function isPending(n: Nutrition): boolean {
  return n.kcal === null;
}

/** 从菜品与份量算出条目营养与待估算状态。 */
export function computeItem(
  dish: Dish,
  grams: number,
  portionLabel: string,
): Omit<MealItem, 'uid'> {
  const nutrition = roundNutrition(scaleNutrition(dish.per100g, grams));
  return {
    dishId: dish.id,
    name: dish.name,
    grams,
    portionLabel,
    pending: isPending(nutrition),
    nutrition,
  };
}

/** 手动补录（菜品库外）的条目：无营养数据，必然待估算。 */
export function computeCustomItem(name: string, grams: number): Omit<MealItem, 'uid'> {
  return {
    dishId: null,
    name,
    grams,
    portionLabel: '自定义',
    pending: true,
    nutrition: { kcal: null, protein: null, fat: null, carbs: null },
  };
}

/** 热量区间：若条目所用菜品带 kcalRange，按克数换算；否则返回 null。 */
export function itemKcalRange(
  dish: Dish | undefined,
  grams: number,
): [number, number] | null {
  if (!dish || !dish.kcalRange || grams <= 0) return null;
  const f = grams / 100;
  return [Math.round(dish.kcalRange[0] * f), Math.round(dish.kcalRange[1] * f)];
}

/** 汇总多条条目。营养素任一缺失即视为不完整，汇总置 null，避免用 0 冒充。 */
export function summarizeItems(items: MealItem[]): MealSummary {
  let kcal = 0;
  let pendingCount = 0;
  let proteinSum = 0;
  let fatSum = 0;
  let carbsSum = 0;
  let proteinOk = true;
  let fatOk = true;
  let carbsOk = true;

  for (const it of items) {
    if (it.pending || it.nutrition.kcal === null) {
      pendingCount += 1;
    } else {
      kcal += it.nutrition.kcal;
    }
    if (it.nutrition.protein === null) proteinOk = false;
    else proteinSum += it.nutrition.protein;
    if (it.nutrition.fat === null) fatOk = false;
    else fatSum += it.nutrition.fat;
    if (it.nutrition.carbs === null) carbsOk = false;
    else carbsSum += it.nutrition.carbs;
  }

  return {
    kcal: Math.round(kcal),
    protein: proteinOk && items.length > 0 ? Math.round(proteinSum * 10) / 10 : null,
    fat: fatOk && items.length > 0 ? Math.round(fatSum * 10) / 10 : null,
    carbs: carbsOk && items.length > 0 ? Math.round(carbsSum * 10) / 10 : null,
    pendingCount,
    itemCount: items.length,
  };
}

/** 克数格式化：整数直接显示，非整数保留一位。 */
export function formatGrams(g: number): string {
  return Number.isInteger(g) ? String(g) : String(Math.round(g * 10) / 10);
}
