// S39O-cs-stats: 日统计与周视图的聚合，全部是记录的纯函数。
// 实现 按日期分组、按天汇总、生成最近七天格子并标记未记录/不完整。
// 原理 统计永不独立存储，永远从 meals 现算，因此「改删后统计一致」是结构保证而非人工维护。
import type { Meal, DayStats, WeekCell, MealSummary } from './types';
import { summarizeItems } from './nutrition';

/** 本地时区下的 YYYY-MM-DD。禁止用 toISOString（那是 UTC，会跨日错位）。 */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 本地时区下的 HH:mm。 */
export function localTime(d: Date = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 把日期字符串解析为本地时区当天 0 点。 */
export function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** 日期加减天数，返回 YYYY-MM-DD。 */
export function addDays(date: string, delta: number): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() + delta);
  return localDate(d);
}

/** 某一天的所有餐食，按时间升序。 */
export function mealsOn(meals: Meal[], date: string): Meal[] {
  return meals.filter((m) => m.date === date).sort((a, b) => a.time.localeCompare(b.time));
}

/** 单日统计。无记录时 logged=false 且各值为 0/null。 */
export function dayStats(meals: Meal[], date: string): DayStats {
  const dayMeals = mealsOn(meals, date);
  const all = dayMeals.flatMap((m) => m.items);
  if (all.length === 0) {
    return {
      date,
      logged: false,
      kcal: 0,
      protein: null,
      fat: null,
      carbs: null,
      pendingCount: 0,
      mealCount: 0,
    };
  }
  const s = summarizeItems(all);
  return {
    date,
    logged: true,
    kcal: s.kcal,
    protein: s.protein,
    fat: s.fat,
    carbs: s.carbs,
    pendingCount: s.pendingCount,
    mealCount: dayMeals.length,
  };
}

/** 截至 endDate（含）的最近 7 天，按时间升序。 */
export function weekStats(meals: Meal[], endDate: string = localDate()): WeekCell[] {
  const cells: WeekCell[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = addDays(endDate, -i);
    const s = dayStats(meals, date);
    cells.push({ ...s, incomplete: s.logged && s.pendingCount > 0 });
  }
  return cells;
}

/** 一餐汇总。 */
export function mealSummary(meal: Meal): MealSummary {
  return summarizeItems(meal.items);
}

/** 星期几的中文单字，用于周视图。 */
export function weekdayLabel(date: string): string {
  return ['日', '一', '二', '三', '四', '五', '六'][parseLocalDate(date).getDay()] ?? '';
}

/** 生成条目/记录 ID。优先用 crypto.randomUUID，降级到时间戳+随机串。 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 按餐次推断默认餐次：按当前时刻。 */
export function defaultSlot(d: Date = new Date()): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const h = d.getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}
