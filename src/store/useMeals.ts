// S39O-cs-meals: 餐食记录的状态容器，所有增删改都经过这里并立即落盘。
// 实现 以 meals 数组为唯一状态源，save/remove/replace 先写盘、成功后才更新内存状态。
// 原理 写盘失败时若照样更新状态，界面会显示一条刷新后就消失的记录，
// 用户会以为存成功了；因此写入是成功的前置条件，失败时返回 null 由调用方决定不跳转。
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Meal, MealItem } from '../domain/types';
import { loadMeals, saveMeals } from './persistence';
import { newId } from '../domain/stats';

export interface MealDraft {
  id?: string;
  date: string;
  time: string;
  slot: Meal['slot'];
  items: Omit<MealItem, 'uid'>[];
}

export interface MealsApi {
  meals: Meal[];
  storageError: string | null;
  /** 保存成功返回餐食，写盘失败返回 null（状态不变，调用方不应跳转）。 */
  saveMeal: (draft: MealDraft) => Meal | null;
  /** 删除成功返回 true。 */
  removeMeal: (id: string) => boolean;
  replaceAll: (meals: Meal[]) => boolean;
}

export function useMeals(): MealsApi {
  const [meals, setMeals] = useState<Meal[]>(() => loadMeals());
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    setMeals(loadMeals());
  }, []);

  const write = useCallback((next: Meal[], onErr: string): boolean => {
    try {
      saveMeals(next);
      setStorageError(null);
      setMeals(next);
      return true;
    } catch (e) {
      console.error('[meals] 写入失败', e);
      setStorageError(onErr);
      return false;
    }
  }, []);

  const saveMeal = useCallback(
    (draft: MealDraft): Meal | null => {
      const now = new Date().toISOString();
      const items: MealItem[] = draft.items.map((it) => ({ ...it, uid: newId() }));
      const id = draft.id ?? newId();
      const existing = meals.find((m) => m.id === id);
      const meal: Meal = {
        id,
        date: draft.date,
        time: draft.time,
        slot: draft.slot,
        items,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const next = existing ? meals.map((m) => (m.id === id ? meal : m)) : [...meals, meal];
      return write(next, '保存失败：浏览器存储不可用或空间不足，这条记录没有存下来') ? meal : null;
    },
    [meals, write],
  );

  const removeMeal = useCallback(
    (id: string): boolean =>
      write(
        meals.filter((m) => m.id !== id),
        '删除失败：浏览器存储不可用',
      ),
    [meals, write],
  );

  const replaceAll = useCallback(
    (next: Meal[]): boolean => write(next, '导入失败：浏览器存储不可用'),
    [write],
  );

  return useMemo(
    () => ({ meals, storageError, saveMeal, removeMeal, replaceAll }),
    [meals, storageError, saveMeal, removeMeal, replaceAll],
  );
}
