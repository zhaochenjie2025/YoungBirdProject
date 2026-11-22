// S39O-cs-store: 餐食记录的本地持久化，版本化 schema + 迁移入口。
// 实现 读写 localStorage 单键 JSON，读取时做逐层结构校验，写入失败显式抛出。
// 原理 存储格式带 version 字段，未来字段变动通过迁移函数升级旧数据，避免升级即丢记录；
// 校验必须深入到每个菜品条目——只验餐级字段时，一个缺 nutrition 的条目会让汇总函数抛错，
// 而错误数据已落盘，刷新后仍然崩，用户没有自愈途径。
import type { Meal, MealItem, MealSlot, Nutrition } from '../domain/types';

const KEY = 'caloriesnap:data:v1';
const SCHEMA_VERSION = 1;

export interface StoreShape {
  version: number;
  meals: Meal[];
}

const SLOTS: ReadonlySet<string> = new Set(['breakfast', 'lunch', 'dinner', 'snack']);

function isNumOrNull(v: unknown): boolean {
  return v === null || (typeof v === 'number' && Number.isFinite(v));
}

function validNutrition(v: unknown): v is Nutrition {
  if (!v || typeof v !== 'object') return false;
  const n = v as Record<string, unknown>;
  return (
    isNumOrNull(n.kcal) && isNumOrNull(n.protein) && isNumOrNull(n.fat) && isNumOrNull(n.carbs)
  );
}

/** 逐字段校验一个菜品条目。任何一项不合格即视为整条不可用。 */
function validItem(v: unknown): v is MealItem {
  if (!v || typeof v !== 'object') return false;
  const it = v as Record<string, unknown>;
  return (
    typeof it.uid === 'string' &&
    (it.dishId === null || typeof it.dishId === 'string') &&
    typeof it.name === 'string' &&
    typeof it.grams === 'number' &&
    Number.isFinite(it.grams) &&
    typeof it.portionLabel === 'string' &&
    typeof it.pending === 'boolean' &&
    validNutrition(it.nutrition)
  );
}

/**
 * 把任意输入规整成合法记录。
 * 餐级字段不合格 → 整条丢弃；菜品条目不合格 → 整条丢弃，
 * 而不是只丢那一个条目，因为丢条目会让「已记录的几道菜」静默变少，比丢整条更误导。
 */
function normalizeMeal(v: unknown): Meal | null {
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  if (
    typeof m.id !== 'string' ||
    typeof m.date !== 'string' ||
    typeof m.time !== 'string' ||
    typeof m.slot !== 'string' ||
    !SLOTS.has(m.slot) ||
    !Array.isArray(m.items) ||
    m.items.length === 0 ||
    !m.items.every(validItem)
  ) {
    console.error('[store] 丢弃一条结构不合法的记录', m.id ?? '(无 id)');
    return null;
  }
  return {
    id: m.id,
    date: m.date,
    time: m.time,
    slot: m.slot as MealSlot,
    items: m.items as MealItem[],
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
    updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : new Date().toISOString(),
  };
}

function normalizeList(input: unknown): Meal[] | null {
  if (!input || typeof input !== 'object') return null;
  const parsed = input as Partial<StoreShape>;
  if (!Array.isArray(parsed.meals)) return null;
  return parsed.meals.map(normalizeMeal).filter((m): m is Meal => m !== null);
}

/** 读取全部记录。存储损坏或不可用时返回空数组并记录到 console，不抛给 UI。 */
export function loadMeals(): Meal[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const list = normalizeList(parsed);
    if (list === null) {
      console.error('[store] 存储结构异常，按空数据处理');
      return [];
    }
    return list;
  } catch (e) {
    console.error('[store] 读取失败', e);
    return [];
  }
}

/** 写入全部记录。失败时抛出，由调用方决定如何提示（隐私模式常见配额异常）。 */
export function saveMeals(meals: Meal[]): void {
  const payload: StoreShape = { version: SCHEMA_VERSION, meals };
  localStorage.setItem(KEY, JSON.stringify(payload));
}

/** 导出为可下载的 JSON 文本。 */
export function exportMeals(meals: Meal[]): string {
  return JSON.stringify({ version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), meals }, null, 2);
}

/** 从 JSON 文本导入，做与读取相同的逐层校验；结构不符返回 null。 */
export function parseImport(text: string): Meal[] | null {
  try {
    return normalizeList(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

/** 清空本机记录，用于数据损坏时的兜底自救。 */
export function clearAll(): void {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    console.error('[store] 清除失败', e);
  }
}

export const STORAGE_KEY = KEY;
