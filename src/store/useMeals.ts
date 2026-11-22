// S39O-cs-meals: 餐食记录的状态容器，所有增删改都经过这里并立即落盘。
// 实现 以 meals 数组为唯一状态源，提供 save/remove/replace；写入失败向 UI 抛出错误。
// 原理 每次变更都同步写 localStorage，刷新后必然一致；不做延迟批量写入，
// 因为记录量在百级、单次写入毫秒级，省下的复杂度远不如「刷新即丢数据」的代价。
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
  saveMeal: (draft: MealDraft) => Meal;
  removeMeal: (id: string) => void;
  replaceAll: (meals: Meal[]) => void;
}

export function useMeals(): MealsApi {
  const [meals, setMeals] = useState<Meal[]>(() => loadMeals());
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    setMeals(loadMeals());
  }, []);

  const write = useCallback((next: Meal[], onErr: string) => {
    try {
      saveMeals(next);
      setStorageError(null);
    } catch (e) {
      console.error('[meals] 写入失败', e);
      setStorageError(onErr);
    }
    setMeals(next);
  }, []);

  const saveMeal = useCallback(
    (draft: MealDraft): Meal => {
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
      write(next, '保存失败：浏览器存储不可用或空间不足');
      return meal;
    },
    [meals, write],
  );

  const removeMeal = useCallback(
    (id: string) => {
      write(
        meals.filter((m) => m.id !== id),
        '删除失败：浏览器存储不可用',
      );
    },
    [meals, write],
  );

  const replaceAll = useCallback((next: Meal[]) => write(next, '导入失败：浏览器存储不可用'), [write]);

  return useMemo(
    () => ({ meals, storageError, saveMeal, removeMeal, replaceAll }),
    [meals, storageError, saveMeal, removeMeal, replaceAll],
  );
}
