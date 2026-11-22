// S39O-cs-mealdetail: 单餐明细页，展示估算热量、菜品明细与估算依据，并可生成膳食建议。
// 实现 展开菜品显示份量与营养出处；建议区域独立异步，失败只影响该区域。
// 原理 建议的成功/失败与主流程完全解耦：即使请求挂起或报错，估算结果、修改、删除都不受影响。
import { useState } from 'react';
import type { PageProps } from '../App';
import { MEAL_SLOT_LABEL } from '../domain/types';
import { itemKcalRange } from '../domain/nutrition';
import { mealSummary } from '../domain/stats';
import { getDish } from '../data/dishes';
import { KcalBlock, MacroRow, ItemRow, Notice, DishEvidence } from '../components/ui';
import { generateAdvice, type AdviceResult } from '../advice/advice';
import { ApiError, apiErrorText } from '../vision/client';
import { editHref } from '../router';

export function MealDetailPage({ meals, settings, navigate, id }: PageProps & { id: string }) {
  const meal = meals.meals.find((m) => m.id === id);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [advice, setAdvice] = useState<AdviceResult | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!meal) {
    return (
      <>
        <header className="app__header">
          <h1 className="app__title">找不到这条记录</h1>
        </header>
        <button className="btn" onClick={() => navigate('history')}>
          回到历史
        </button>
      </>
    );
  }

  const summary = mealSummary(meal);

  async function onAdvice() {
    if (!settings.hasKey) {
      setAdviceError('未配置 API key，无法生成建议。先在设置里填入。');
      return;
    }
    setAdviceLoading(true);
    setAdviceError(null);
    try {
      const result = await generateAdvice(settings.apiKey, {
        meal: meal!,
        summary,
        complete: summary.pendingCount === 0,
      });
      setAdvice(result);
    } catch (err) {
      const msg = err instanceof ApiError ? apiErrorText(err.kind) : '生成失败';
      setAdviceError(msg);
    } finally {
      setAdviceLoading(false);
    }
  }

  return (
    <>
      <header className="app__header">
        <div>
          <h1 className="app__title">{MEAL_SLOT_LABEL[meal.slot]}</h1>
          <div className="app__sub">
            {meal.date} · {meal.time}
          </div>
        </div>
        <button className="btn btn--ghost" onClick={() => navigate('today')}>
          返回
        </button>
      </header>

      <section className="card">
        <KcalBlock kcal={summary.kcal} pendingCount={summary.pendingCount} />
        <MacroRow nutrition={summary} />
      </section>

      {summary.pendingCount > 0 && (
        <Notice kind="warn">
          这一餐有 {summary.pendingCount} 道菜缺少营养数据，热量为已估算部分。展开可查看说明。
        </Notice>
      )}

      <section className="section">
        <div className="section__head">
          <span className="section__title">菜品明细</span>
          <span className="app__sub">{summary.itemCount} 道</span>
        </div>
        <div className="card">
          {meal.items.map((it) => {
            const dish = it.dishId ? getDish(it.dishId) : undefined;
            const range = itemKcalRange(dish, it.grams);
            const open = openUid === it.uid;
            return (
              <div key={it.uid}>
                <ItemRow item={it} onClick={() => setOpenUid(open ? null : it.uid)} />
                {open && (
                  <>
                    {dish ? (
                      <DishEvidence dish={dish} grams={it.grams} />
                    ) : (
                      <div className="detail">
                        <div>这是自定义菜品，菜品库里没有对应条目，因此标记为待估算。</div>
                        <div style={{ marginTop: 'var(--s-1)' }}>
                          按 <span className="num">{it.grams}</span> 克记录。
                        </div>
                      </div>
                    )}
                    {range && (
                      <div className="detail" style={{ marginTop: 'var(--s-2)' }}>
                        热量参考区间（按 <span className="num">{it.grams}</span> 克）：
                        <span className="num">{range[0]}</span> ~ <span className="num">{range[1]}</span> 千卡
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card section">
        <div className="section__head" style={{ marginBottom: 'var(--s-3)' }}>
          <span className="section__title">膳食建议</span>
        </div>
        {!advice && !adviceLoading && (
          <div style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>
            根据这一餐的搭配生成简短建议。数值来自上面的估算结果，模型只做解释。
          </div>
        )}
        {adviceLoading && <div style={{ fontSize: 'var(--t-sm)' }}>正在生成建议…</div>}
        {adviceError && <Notice kind="warn">{adviceError}</Notice>}
        {advice && (
          <>
            <div className="advice">{advice.text}</div>
            {advice.suspiciousNumbers.length > 0 && (
              <div style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 'var(--s-2)' }}>
                提示：建议里出现了结果页未给出的数值，热量与营养请以上方估算结果为准。
              </div>
            )}
          </>
        )}
        <div className="advice__actions">
          <button className="btn" onClick={onAdvice} disabled={adviceLoading}>
            {advice ? '重新生成' : '生成建议'}
          </button>
        </div>
      </section>

      <div className="actions">
        <button className="btn" onClick={() => navigate(editHref(meal.id).slice(2))}>
          修改这一餐
        </button>
        {!confirmDelete ? (
          <button className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
            删除
          </button>
        ) : (
          <>
            <button
              className="btn btn--danger"
              onClick={() => {
                meals.removeMeal(meal.id);
                navigate('history');
              }}
            >
              确认删除
            </button>
            <button className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>
              取消
            </button>
          </>
        )}
      </div>
    </>
  );
}
