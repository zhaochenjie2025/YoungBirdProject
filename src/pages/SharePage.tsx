// S39O-cs-postcard: 分享页，把一餐 / 一天 / 一周的记录冲印成一张可保存的明信片。
// 实现 三个范围各自从 meals 现算 ShareData，交给 canvas 模块绘制；保存按钮触发 PNG 下载。
// 原理 数值与图全部来自 domain 层纯函数，本页不参与任何营养计算，
// 因此分享图上的数字与结果页、周视图必然一致，不会出现「截图好看但数据对不上」。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PageProps } from '../App';
import { localDate, mealsOn, dayStats, weekStats, parseLocalDate } from '../domain/stats';
import { mealSummary } from '../domain/stats';
import { macroShare } from '../domain/nutrition';
import { MEAL_SLOT_LABEL } from '../domain/types';
import { drawShare, downloadShare, SHARE_SIZE, type ShareData, type ShareScope } from '../share/canvas';

const SCOPE_LABEL: Record<ShareScope, string> = {
  meal: '这一餐',
  day: '这一天',
  week: '这一周',
};

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** 「'26 11 23 MON」样式的日期戳。 */
function stampOf(date: string): string {
  const d = parseLocalDate(date);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const wd = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()] ?? '';
  return `'${yy} ${mm} ${dd} ${wd}`;
}

export function SharePage({ meals }: PageProps) {
  const [scope, setScope] = useState<ShareScope>('meal');
  const [saved, setSaved] = useState<'idle' | 'ok' | 'blocked'>('idle');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const today = localDate();
  const todayMeals = useMemo(() => mealsOn(meals.meals, today), [meals.meals, today]);

  /** 挑主图：取这一餐里热量最高的那道菜，视觉分量与数字一致。 */
  function leadPhoto(items: readonly import('../domain/types').MealItem[]): string | null {
    const withKcal = items
      .filter((it) => it.dishId && it.nutrition.kcal !== null)
      .sort((a, b) => (b.nutrition.kcal ?? 0) - (a.nutrition.kcal ?? 0));
    const lead = withKcal[0] ?? items.find((it) => it.dishId);
    return lead?.dishId ?? null;
  }

  /** 三个范围共用的一套推导，返回 null 表示当天/当餐没有可分享的内容。 */
  const data = useMemo<ShareData | null>(() => {
    if (scope === 'meal') {
      // 「这一餐」取当天最近记录的一餐，而不是最早的一餐。
      const meal = todayMeals[todayMeals.length - 1];
      if (!meal) return null;
      const s = mealSummary(meal);
      return {
        kicker: SCOPE_LABEL.meal,
        stamp: `${MEAL_SLOT_LABEL[meal.slot].toUpperCase()} ${meal.time}`,
        photo: leadPhoto(meal.items),
        photoDate: stampOf(meal.date),
        kcal: s.kcal,
        todo: s.pendingCount,
        share: macroShare({
          protein: s.protein,
          fat: s.fat,
          carbs: s.carbs,
        }),
        caption: '好好吃饭，是今天最先做成的一件小事',
        items: meal.items.map((it) => ({ name: it.name, kcal: it.pending ? null : it.nutrition.kcal })),
      };
    }

    if (scope === 'day') {
      const st = dayStats(meals.meals, today);
      if (!st.logged) return null;
      const all = todayMeals.flatMap((m) => m.items);
      return {
        kicker: SCOPE_LABEL.day,
        stamp: stampOf(today),
        photo: leadPhoto(all),
        photoDate: stampOf(today),
        kcal: st.kcal,
        todo: st.pendingCount,
        share: macroShare({ protein: st.protein, fat: st.fat, carbs: st.carbs }),
        caption: '一整天的饭，都在这几张相纸里',
        items: todayMeals.map((m) => ({
          name: `${MEAL_SLOT_LABEL[m.slot]} ${m.time}`,
          kcal: mealSummary(m).kcal,
        })),
      };
    }

    // 周视图
    const cells = weekStats(meals.meals, today);
    const logged = cells.filter((c) => c.logged);
    if (logged.length === 0) return null;
    const total = logged.reduce((a, c) => a + c.kcal, 0);
    const todo = cells.reduce((a, c) => a + c.pendingCount, 0);

    // 周汇总的营养素用「已记录且完整」的天数求供能占比。
    const full = logged.filter((c) => c.pendingCount === 0);
    const p = full.reduce((a, c) => a + (c.protein ?? 0), 0);
    const f = full.reduce((a, c) => a + (c.fat ?? 0), 0);
    const c2 = full.reduce((a, c) => a + (c.carbs ?? 0), 0);
    const hasMacro = full.length > 0 && full.every((c) => c.protein !== null);

    const d0 = parseLocalDate(today);
    const weekNo = Math.ceil(
      ((d0.getTime() - new Date(d0.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7,
    );

    return {
      kicker: SCOPE_LABEL.week,
      stamp: `'${String(d0.getFullYear()).slice(2)} ${MONTHS[d0.getMonth()]} W${weekNo}`,
      photo: null,
      kcal: total,
      todo,
      share: hasMacro ? macroShare({ protein: p, fat: f, carbs: c2 }) : null,
      caption: '一周的饭，拍下来才看得见',
      logged: logged.length,
      bars: cells.map((cell) => {
        const isToday = cell.date === today;
        return {
          empty: !cell.logged,
          kcal: cell.kcal,
          share:
            cell.logged && cell.pendingCount === 0
              ? macroShare({ protein: cell.protein, fat: cell.fat, carbs: cell.carbs })
              : null,
          today: isToday,
          dayLbl: isToday ? '今' : String(parseLocalDate(cell.date).getDate()),
        };
      }),
    };
  }, [scope, meals.meals, today, todayMeals]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !data) return;
    setSaved('idle');
    void drawShare(cv, data);
  }, [data]);

  return (
    <>
      <header className="app__header">
        <div>
          <h1 className="app__title">留张小样片</h1>
          <div className="app__sub">选一段记录，冲印成明信片</div>
        </div>
      </header>

      <div className="sh-seg" role="tablist" aria-label="分享范围">
        {(['meal', 'day', 'week'] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            onClick={() => setScope(s)}
          >
            {SCOPE_LABEL[s]}
          </button>
        ))}
      </div>

      {data ? (
        <>
          <div className="sh-stage">
            <canvas
              ref={canvasRef}
              className="sh-preview"
              width={SHARE_SIZE.width}
              height={SHARE_SIZE.height}
              aria-label="分享样张预览"
            />
          </div>

          <div className="sh-actions">
            <button
              className="sh-save"
              onClick={() => {
                const cv = canvasRef.current;
                if (!cv) return;
                setSaved(downloadShare(cv) ? 'ok' : 'blocked');
              }}
            >
              保存这张拍立得
            </button>
            <p className="sh-hint">
              点击生成高清 PNG；手机端也可<b>长按预览图</b>直接保存。
            </p>
          </div>

          {saved === 'ok' && (
            <div className="sh-saved show">
              <b>已存下这张样片。</b> 直接发朋友圈或小红书，就是一张暖阳拍立得食记。
            </div>
          )}
          {saved === 'blocked' && (
            <div className="sh-saved show">
              <b>浏览器拦下了自动下载。</b> 长按上面的预览图，选「存储图片」即可保存。
            </div>
          )}
        </>
      ) : (
        <div className="card">
          <div className="empty">
            <div className="empty__title">
              {scope === 'meal' ? '今天还没有可以冲印的一餐' : scope === 'day' ? '今天还没有记录' : '最近七天还没有记录'}
            </div>
            <p className="empty__sub">先记一餐，回来就能把它冲成一张明信片。</p>
          </div>
        </div>
      )}
    </>
  );
}
