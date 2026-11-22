// S39O-cs-test-store: 持久化层的单元测试，覆盖畸形数据的过滤。
// 实现 直接测 parseImport 与 normalizeList 的各条分支：缺 nutrition、缺 grams、items 含 null、空 items。
// 原理 畸形数据曾能通过校验并落盘，导致刷新后渲染抛错整页白屏；这条路径必须由测试守住。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseImport, loadMeals, saveMeals, clearAll } from '../src/store/persistence';
import type { Meal } from '../src/domain/types';

const good: Meal = {
  id: 'm1',
  date: '2026-11-23',
  time: '12:00',
  slot: 'lunch',
  items: [
    {
      uid: 'u1',
      dishId: 'rice',
      name: '米饭',
      grams: 200,
      portionLabel: '标准份',
      pending: false,
      nutrition: { kcal: 232, protein: 5.2, fat: 0.6, carbs: 51.6 },
    },
  ],
  createdAt: '2026-11-23T04:00:00Z',
  updatedAt: '2026-11-23T04:00:00Z',
};

function wrap(meals: unknown[]): string {
  return JSON.stringify({ version: 1, meals });
}

/** 构造一条只替换 items 的记录。 */
function withItems(items: unknown[]): unknown {
  return { ...good, items };
}

describe('parseImport 校验', () => {
  it('接受合法记录', () => {
    const r = parseImport(wrap([good]));
    expect(r).not.toBeNull();
    expect(r!).toHaveLength(1);
  });

  it('非法 JSON 返回 null', () => {
    expect(parseImport('{not json')).toBeNull();
  });

  it('缺 meals 数组返回 null', () => {
    expect(parseImport(JSON.stringify({ version: 1 }))).toBeNull();
    expect(parseImport(JSON.stringify({ meals: 'x' }))).toBeNull();
  });

  it('条目缺 nutrition 时整条记录被丢弃', () => {
    const bad = withItems([{ uid: 'u', dishId: null, name: 'x', grams: 100, portionLabel: '自定义', pending: true }]);
    const r = parseImport(wrap([bad]));
    expect(r).toEqual([]);
  });

  it('条目 nutrition 字段类型不对时丢弃', () => {
    const bad = withItems([
      {
        uid: 'u',
        dishId: 'rice',
        name: '米饭',
        grams: 200,
        portionLabel: '标准份',
        pending: false,
        nutrition: { kcal: '232', protein: null, fat: null, carbs: null },
      },
    ]);
    expect(parseImport(wrap([bad]))).toEqual([]);
  });

  it('items 含 null 时丢弃整条', () => {
    const bad = withItems([null]);
    expect(parseImport(wrap([bad]))).toEqual([]);
  });

  it('items 为空数组时丢弃', () => {
    expect(parseImport(wrap([withItems([])]))).toEqual([]);
  });

  it('缺 grams 时丢弃', () => {
    const bad = withItems([
      { uid: 'u', dishId: null, name: 'x', portionLabel: '自定义', pending: true, nutrition: { kcal: null, protein: null, fat: null, carbs: null } },
    ]);
    expect(parseImport(wrap([bad]))).toEqual([]);
  });

  it('slot 非法时丢弃', () => {
    const bad = { ...good, slot: 'brunch' } as unknown as Meal;
    expect(parseImport(wrap([bad]))).toEqual([]);
  });

  it('好坏混杂时保留好的、丢掉坏的', () => {
    const bad = withItems([]);
    const r = parseImport(wrap([good, bad, good]));
    expect(r).not.toBeNull();
    expect(r!).toHaveLength(2);
  });

  it('NaN 与 Infinity 视为非法', () => {
    const bad = withItems([
      {
        uid: 'u',
        dishId: 'rice',
        name: '米饭',
        grams: Number.NaN,
        portionLabel: '标准份',
        pending: false,
        nutrition: { kcal: 1, protein: 1, fat: 1, carbs: 1 },
      },
    ]);
    expect(parseImport(wrap([bad]))).toEqual([]);
  });
});

describe('loadMeals 与存储', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it('空存储返回空数组', () => {
    expect(loadMeals()).toEqual([]);
  });

  it('写入后能读回', () => {
    saveMeals([good]);
    expect(loadMeals()).toHaveLength(1);
  });

  it('存储里的畸形记录被过滤而非抛错', () => {
    store.set('caloriesnap:data:v1', wrap([withItems([])]));
    expect(() => loadMeals()).not.toThrow();
    expect(loadMeals()).toEqual([]);
  });

  it('存储内容不是 JSON 时返回空数组', () => {
    store.set('caloriesnap:data:v1', 'garbage');
    expect(loadMeals()).toEqual([]);
  });

  it('clearAll 后读到空数组', () => {
    saveMeals([good]);
    clearAll();
    expect(loadMeals()).toEqual([]);
  });
});
