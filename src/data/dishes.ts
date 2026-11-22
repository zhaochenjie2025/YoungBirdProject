// S39O-cs-dishdata: 菜品库唯一的读取入口，负责加载、按 ID 查表、拼装识别用的目录文本。
// 实现 从 dishes.json 载入做一次索引，导出 getDish / allDishes / buildCatalogPrompt。
// 原理 识别走「封闭选择」，提示词里的目录与前端查表必须来自同一份数据，任何一处独立维护都会导致 ID 对不上。
import raw from './dishes.json';
import type { Dish } from '../domain/types';

const dishes = raw as Dish[];
const byId = new Map<string, Dish>(dishes.map((d) => [d.id, d]));

/** 全部菜品，供搜索与统计使用。 */
export function allDishes(): readonly Dish[] {
  return dishes;
}

/** 按 ID 查菜品；不存在返回 undefined。 */
export function getDish(id: string): Dish | undefined {
  return byId.get(id);
}

/**
 * 生成识别用的菜品目录文本。每行一个菜品，含 ID、标准名、别名、烹饪方式。
 * 顺序固定（按 dishes.json 原序），保证提示词前缀稳定、可命中上游缓存。
 */
export function buildCatalogPrompt(): string {
  const lines = dishes.map(
    (d) => `${d.id} | ${d.name} | 别名:${d.aliases.join('/') || '无'} | ${d.cooking} | ${d.category}`,
  );
  return lines.join('\n');
}

/** 菜品目录的合法 ID 集合，用于校验模型返回值。 */
export function validDishIds(): Set<string> {
  return new Set(byId.keys());
}
