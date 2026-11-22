// S39O-cs-search: 菜品搜索，支持标准名与别名，纯前端模糊匹配。
// 实现 对菜名与别名做包含匹配，按「命中位置 + 名称长度」排序，返回前 N 条。
// 原理 只做子串匹配而不引入模糊算法，是因为菜品总量在百级、中文输入基本是完整词，复杂度换不回收益。
import { allDishes } from './dishes';
import type { Dish } from '../domain/types';

/** 归一化：小写、去空白。 */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

/**
 * 搜索菜品。空查询返回空数组（由调用方决定是否展示全部）。
 * 排序规则：菜名完全相等 > 菜名前缀 > 菜名子串 > 别名子串；同级按名称长度升序。
 */
export function searchDishes(query: string, limit = 8): Dish[] {
  const q = norm(query);
  if (!q) return [];
  const scored: Array<{ dish: Dish; score: number }> = [];

  for (const dish of allDishes()) {
    const name = norm(dish.name);
    let score = Infinity;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(q)) score = 2;
    else if (dish.aliases.some((a) => norm(a).includes(q))) score = 3;
    if (score < Infinity) scored.push({ dish, score });
  }

  scored.sort((a, b) => a.score - b.score || a.dish.name.length - b.dish.name.length);
  return scored.slice(0, limit).map((s) => s.dish);
}
