// S39O-cs-test-nutrition: 营养计算与统计的单元测试，覆盖 PRD 的数值验收条目。
// 实现 验证线性缩放、缺失传播、半份改标准份的联动、日/周统计一致性与时区边界。
// 原理 PRD 的「改份量后明细与汇总同步」「改删后日周统计一致」只能靠纯函数测试证明，
// 浏览器手点无法覆盖 null 传播这类分支。
import { describe, it, expect } from 'vitest';
import {
  scaleNutrition,
  roundNutrition,
  summarizeItems,
  computeItem,
  computeCustomItem,
  isPending,
  itemKcalRange,
  macroShare,
} from '../src/domain/nutrition';
import { dayStats, weekStats, localDate, addDays, mealsOn } from '../src/domain/stats';
import type { Dish, Meal, MealItem } from '../src/domain/types';
import { extractNumbers } from '../src/advice/advice';

const tomatoEgg: Dish = {
  id: 'tomato-egg',
  name: '番茄炒蛋',
  aliases: ['西红柿炒鸡蛋'],
  cooking: '炒',
  category: '蛋豆',
  per100g: { kcal: 110, protein: 6.5, fat: 7.8, carbs: 4.2 },
  source: { name: '测试来源' },
  portions: [
    { key: 'half', label: '半份', grams: 90 },
    { key: 'standard', label: '标准份', grams: 180 },
  ],
  portionSource: { name: '测试称重' },
  kcalRange: [85, 130],
};

const missingData: Dish = {
  ...tomatoEgg,
  id: 'unknown',
  name: '未知菜',
  per100g: { kcal: null, protein: null, fat: null, carbs: null },
  kcalRange: undefined,
};

function mkItem(over: Partial<MealItem> = {}): MealItem {
  return {
    uid: Math.random().toString(),
    dishId: 'tomato-egg',
    name: '番茄炒蛋',
    grams: 180,
    portionLabel: '标准份',
    pending: false,
    nutrition: { kcal: 198, protein: 11.7, fat: 14, carbs: 7.6 },
    ...over,
  };
}

function mkMeal(over: Partial<Meal> = {}): Meal {
  return {
    id: Math.random().toString(),
    date: '2026-11-23',
    time: '12:00',
    slot: 'lunch',
    items: [mkItem()],
    createdAt: '2026-11-23T12:00:00Z',
    updatedAt: '2026-11-23T12:00:00Z',
    ...over,
  };
}

describe('scaleNutrition', () => {
  it('按克数线性缩放', () => {
    const r = scaleNutrition({ kcal: 110, protein: 6.5, fat: 7.8, carbs: 4.2 }, 180);
    expect(r.kcal).toBeCloseTo(198, 5);
    expect(r.protein).toBeCloseTo(11.7, 5);
  });

  it('半份正好是标准份的一半', () => {
    const half = scaleNutrition(tomatoEgg.per100g, 90);
    const std = scaleNutrition(tomatoEgg.per100g, 180);
    expect(half.kcal!).toBeCloseTo(std.kcal! / 2, 5);
  });

  it('克数非法时全部为 null', () => {
    expect(scaleNutrition(tomatoEgg.per100g, 0).kcal).toBeNull();
    expect(scaleNutrition(tomatoEgg.per100g, -5).kcal).toBeNull();
    expect(scaleNutrition(tomatoEgg.per100g, NaN).kcal).toBeNull();
  });

  it('缺失字段保持 null，不被当成 0', () => {
    const r = scaleNutrition({ kcal: 100, protein: null, fat: 5, carbs: null }, 200);
    expect(r.kcal).toBe(200);
    expect(r.protein).toBeNull();
    expect(r.fat).toBe(10);
    expect(r.carbs).toBeNull();
  });
});

describe('computeItem 与待估算', () => {
  it('有数据的菜品不是待估算', () => {
    const it = computeItem(tomatoEgg, 180, '标准份');
    expect(it.pending).toBe(false);
    expect(it.nutrition.kcal).toBe(198);
  });

  it('无营养数据标为待估算', () => {
    const it = computeItem(missingData, 180, '标准份');
    expect(it.pending).toBe(true);
    expect(it.nutrition.kcal).toBeNull();
  });

  it('自定义菜品必然待估算', () => {
    const it = computeCustomItem('凉皮', 200);
    expect(it.pending).toBe(true);
    expect(it.dishId).toBeNull();
  });

  it('半份改标准份，热量翻倍（PRD 验收）', () => {
    const half = computeItem(tomatoEgg, 90, '半份');
    const std = computeItem(tomatoEgg, 180, '标准份');
    expect(std.nutrition.kcal!).toBeCloseTo(half.nutrition.kcal! * 2, 5);
  });
});

describe('summarizeItems', () => {
  it('混合待估算条目时热量只累加已估算部分并计数', () => {
    const items = [
      mkItem({ nutrition: { kcal: 198, protein: 11.7, fat: 14, carbs: 7.6 } }),
      mkItem({ pending: true, nutrition: { kcal: null, protein: null, fat: null, carbs: null } }),
    ];
    const s = summarizeItems(items);
    expect(s.kcal).toBe(198);
    expect(s.pendingCount).toBe(1);
    expect(s.itemCount).toBe(2);
  });

  it('任一营养素缺失则汇总为 null', () => {
    const items = [
      mkItem({ nutrition: { kcal: 198, protein: 11.7, fat: 14, carbs: 7.6 } }),
      mkItem({ pending: false, nutrition: { kcal: 100, protein: null, fat: 2, carbs: 3 } }),
    ];
    const s = summarizeItems(items);
    expect(s.kcal).toBe(298);
    expect(s.protein).toBeNull();
    expect(s.fat).toBeCloseTo(16, 5);
  });

  it('空数组不产生虚假的 0 值营养素', () => {
    const s = summarizeItems([]);
    expect(s.protein).toBeNull();
    expect(s.itemCount).toBe(0);
  });
});

describe('dayStats 与 weekStats', () => {
  it('未记录日期 logged=false', () => {
    const s = dayStats([], '2026-11-23');
    expect(s.logged).toBe(false);
    expect(s.mealCount).toBe(0);
  });

  it('同日多餐汇总一致', () => {
    const m1 = mkMeal({ id: 'a', time: '08:00', items: [mkItem({ nutrition: { kcal: 100, protein: 1, fat: 1, carbs: 1 } })] });
    const m2 = mkMeal({ id: 'b', time: '12:00', items: [mkItem({ nutrition: { kcal: 200, protein: 2, fat: 2, carbs: 2 } })] });
    const s = dayStats([m1, m2], '2026-11-23');
    expect(s.kcal).toBe(300);
    expect(s.mealCount).toBe(2);
    expect(s.protein).toBe(3);
  });

  it('删除一条记录后统计同步减少（PRD 验收）', () => {
    const m1 = mkMeal({ id: 'a', items: [mkItem({ nutrition: { kcal: 100, protein: 1, fat: 1, carbs: 1 } })] });
    const m2 = mkMeal({ id: 'b', items: [mkItem({ nutrition: { kcal: 200, protein: 2, fat: 2, carbs: 2 } })] });
    expect(dayStats([m1, m2], '2026-11-23').kcal).toBe(300);
    expect(dayStats([m1], '2026-11-23').kcal).toBe(100);
  });

  it('周视图覆盖连续七天且今天在最后', () => {
    const cells = weekStats([], '2026-11-23');
    expect(cells).toHaveLength(7);
    expect(cells[6]!.date).toBe('2026-11-23');
    expect(cells[0]!.date).toBe('2026-11-17');
  });

  it('含待估算的日期标记为不完整', () => {
    const m = mkMeal({
      items: [
        mkItem({ nutrition: { kcal: 100, protein: 1, fat: 1, carbs: 1 } }),
        mkItem({ pending: true, nutrition: { kcal: null, protein: null, fat: null, carbs: null } }),
      ],
    });
    const cells = weekStats([m], '2026-11-23');
    const today = cells.find((c) => c.date === '2026-11-23')!;
    expect(today.incomplete).toBe(true);
    expect(today.pendingCount).toBe(1);
  });
});

describe('日期工具', () => {
  it('本地日期不受 UTC 影响（跨日边界）', () => {
    // 本地 2026-11-23 00:30 在 UTC 是 22 日，localDate 必须给 23
    const d = new Date(2026, 10, 23, 0, 30);
    expect(localDate(d)).toBe('2026-11-23');
  });

  it('加减天数跨月正确', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('mealsOn 只返回指定日期并按时间升序', () => {
    const a = mkMeal({ id: 'a', date: '2026-11-23', time: '18:00' });
    const b = mkMeal({ id: 'b', date: '2026-11-23', time: '08:00' });
    const c = mkMeal({ id: 'c', date: '2026-11-22', time: '12:00' });
    const r = mealsOn([a, b, c], '2026-11-23');
    expect(r.map((m) => m.id)).toEqual(['b', 'a']);
  });
});

describe('其他工具', () => {
  it('isPending 只在热量缺失时为真', () => {
    expect(isPending({ kcal: null, protein: 1, fat: 1, carbs: 1 })).toBe(true);
    expect(isPending({ kcal: 0, protein: 1, fat: 1, carbs: 1 })).toBe(false);
  });

  it('roundNutrition 保持 null', () => {
    expect(roundNutrition({ kcal: null, protein: null, fat: null, carbs: null }).kcal).toBeNull();
  });

  it('热量区间按克数换算', () => {
    const r = itemKcalRange(tomatoEgg, 180);
    expect(r).toEqual([153, 234]);
  });

  it('没有区间数据时返回 null', () => {
    expect(itemKcalRange(missingData, 180)).toBeNull();
    expect(itemKcalRange(undefined, 180)).toBeNull();
  });
});


describe('建议数字提取', () => {
  it('提取整数与小数', () => {
    expect(extractNumbers('已有 189 千卡，蛋白质 11.7 克')).toEqual(['189', '11.7']);
  });

  it('没有数字时返回空数组', () => {
    expect(extractNumbers('这餐蔬菜偏少')).toEqual([]);
  });
});

describe('供能占比', () => {
  it('按 4/9/4 千卡每克换算，不是按克数', () => {
    // 蛋白 10g=40kcal，脂肪 10g=90kcal，碳水 10g=40kcal，合计 170kcal
    const s = macroShare({ protein: 10, fat: 10, carbs: 10 });
    expect(s).not.toBeNull();
    expect(s!.protein).toBeCloseTo(40 / 170, 6);
    expect(s!.fat).toBeCloseTo(90 / 170, 6);
    expect(s!.carbs).toBeCloseTo(40 / 170, 6);
  });

  it('三项相加恒为 1', () => {
    const s = macroShare({ protein: 6.5, fat: 7.8, carbs: 4.2 })!;
    expect(s.protein + s.fat + s.carbs).toBeCloseTo(1, 10);
  });

  it('脂肪每克 9 千卡，同样克数下占比明显高于另两项', () => {
    const s = macroShare({ protein: 10, fat: 10, carbs: 10 })!;
    expect(s.fat).toBeGreaterThan(s.protein);
    expect(s.fat).toBeGreaterThan(s.carbs);
  });

  it('任一项缺失时返回 null，不用 0 冒充', () => {
    expect(macroShare({ protein: 10, fat: null, carbs: 10 })).toBeNull();
    expect(macroShare({ protein: null, fat: null, carbs: null })).toBeNull();
  });

  it('总能量为 0 时返回 null，避免除零', () => {
    expect(macroShare({ protein: 0, fat: 0, carbs: 0 })).toBeNull();
  });
});
