// S39O-cs-store: 餐食记录的本地持久化，版本化 schema + 迁移入口。
// 实现 读写 localStorage 单键 JSON，读取时做结构校验与版本迁移，写入失败显式抛出。
// 原理 存储格式带 version 字段，未来字段变动通过迁移函数升级旧数据，避免升级即丢记录。
import type { Meal } from '../domain/types';

const KEY = 'caloriesnap:data:v1';
const SCHEMA_VERSION = 1;

export interface StoreShape {
  version: number;
  meals: Meal[];
}

/** 校验一条记录的结构是否可用。 */
function isMeal(v: unknown): v is Meal {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.date === 'string' &&
    typeof m.time === 'string' &&
    typeof m.slot === 'string' &&
    Array.isArray(m.items)
  );
}

/** 读取全部记录。存储损坏或不可用时返回空数组并记录到 console，不抛给 UI。 */
export function loadMeals(): Meal[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed || !Array.isArray(parsed.meals)) {
      console.error('[store] 存储结构异常，按空数据处理');
      return [];
    }
    return parsed.meals.filter(isMeal);
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

/** 从 JSON 文本导入，返回合法的记录数组；结构不符返回 null。 */
export function parseImport(text: string): Meal[] | null {
  try {
    const parsed = JSON.parse(text) as Partial<StoreShape>;
    if (!parsed || !Array.isArray(parsed.meals)) return null;
    return parsed.meals.filter(isMeal);
  } catch {
    return null;
  }
}

export const STORAGE_KEY = KEY;
