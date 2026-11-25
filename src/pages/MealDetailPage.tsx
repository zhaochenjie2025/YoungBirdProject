// S39O-cs-mealdetail: 单餐明细页，用一张「已显影的相纸」展示估算热量、菜品明细与依据。
// 实现 顶部相纸放主图与合计，相纸下是宏量营养、待估算提示与膳食建议；展开菜品可看份量与营养出处。
// 原理 建议区域独立异步，失败只影响该区域：即使请求挂起或报错，
// 估算结果、修改、删除都不受影响，这是 PRD 三.4 的验收要求。
import { useState } from 'react';
import type { PageProps } from '../App';
import { MEAL_SLOT_LABEL } from '../domain/types';
import { itemKcalRange } from '../domain/nutrition';
import { mealSummary, parseLocalDate } from '../domain/stats';
import { getDish } from '../data/dishes';
import { dishPhoto } from '../data/photos';
import { MacroRow, Notice, DishEvidence } from '../components/ui';
import { generateAdvice, type AdviceResult } from '../advice/advice';
import { ApiError, apiErrorText } from '../vision/client';
import { editHref } from '../router';

/** 相纸上压印的短日期，如 '26 11 25。 */
function imprint(date: string): string {
  const d = parseLocalDate(date);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `'${yy} ${mm} ${dd}`;
}

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
        <button className="btn" onClick={() => navigate('today')}>
          回到今日
        </button>
      </>
    );
  }

  const summary = mealSummary(meal);
  // 主图取热量最高的那道菜，与分享页同一规则，避免封面与数字对不上。
  const lead = meal.items
    .filter((it) => it.dishId && it.nutrition.kcal !== null)
    .sort((a, b) => (b.nutrition.kcal ?? 0) - (a.nutrition.kcal ?? 0))[0];
  const photo = dishPhoto(lead?.dishId ?? meal.items.find((i) => i.dishId)?.dishId);
  const leadName = lead?.name ?? meal.items[0]?.name ?? '';

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
      <div className="res-head">
        <h2>这一张，显影好了</h2>
        <div className="res-time">
          <b>{MEAL_SLOT_LABEL[meal.slot]}</b>
          {meal.time} 记录
        </div>
      </div>

      <div className="print res-print">
        <div className="tape">显影完成</div>
        <div className="print__glare" />
        {photo ? (
          <div className="print__photo">
            <img src={photo} alt={leadName} width="480" height="480" />
            <span className="date-imprint">{imprint(meal.date)}</span>
          </div>
        ) : (
          <div className="print__photo print__photo--blank">
            <span className="hand">{leadName || '这一餐'}</span>
            <span className="date-imprint">{imprint(meal.date)}</span>
          </div>
        )}
        <div className="print__chin">
          <div className="dishlist">
            {meal.items.map((it) => {
              const open = openUid === it.uid;
              return (
                <div key={it.uid}>
                  <button
                    className="entry__btn"
                    aria-expanded={open}
                    onClick={() => setOpenUid(open ? null : it.uid)}
                  >
                    <span className="entry__name">{it.name}</span>
                    <span className={`entry__kcal${it.pending ? ' todo' : ''}`}>
                      {it.pending ? '待估算' : `${Math.round(it.nutrition.kcal ?? 0)} 千卡`}
                    </span>
                    <span className="entry__chev" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {open && <EntryPanel item={it} />}
                </div>
              );
            })}
          </div>
          <div className="draft-sum">
            <div className="ds-l">
              {summary.pendingCount > 0 ? '已估算热量' : '这一餐合计'}
              <b>
                {summary.itemCount} 道菜
                {summary.pendingCount > 0 ? `，含 ${summary.pendingCount} 道待估算` : ''}
              </b>
            </div>
            <div className="ds-k">
              {summary.kcal}
              <em>千卡</em>
            </div>
          </div>
        </div>
      </div>

      <section className="card section">
        <MacroRow nutrition={summary} />
      </section>

      {summary.pendingCount > 0 && (
        <Notice kind="warn">
          这一餐有 {summary.pendingCount} 道菜缺少营养数据，热量为已估算部分。展开可查看说明。
        </Notice>
      )}

      <section className="card section">
        <div className="section__head" style={{ marginBottom: 'var(--s-3)' }}>
          <span className="section__title">膳食建议</span>
        </div>
        {!advice && !adviceLoading && (
          <div style={{ fontSize: 'var(--t-sm)', color: 'var(--ink3)' }}>
            根据这一餐的搭配生成简短建议。数值来自上面的估算结果，模型只做解释。
          </div>
        )}
        {adviceLoading && <div style={{ fontSize: 'var(--t-sm)' }}>正在生成建议…</div>}
        {adviceError && <Notice kind="warn">{adviceError}</Notice>}
        {advice && (
          <>
            <div className="advice">{advice.text}</div>
            {advice.suspiciousNumbers.length > 0 && (
              <div style={{ fontSize: 'var(--t-xs)', color: 'var(--ink3)', marginTop: 'var(--s-2)' }}>
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

      <div className="txtbtn">
        <button className="tbtn" onClick={() => navigate('share')}>
          把这一餐做成明信片 →
        </button>
      </div>

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
                navigate('today');
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

/** 展开后的单条明细：份量、每 100 克数据、出处，以及可选的区间。 */
function EntryPanel({ item }: { item: import('../domain/types').MealItem }) {
  const dish = item.dishId ? getDish(item.dishId) : undefined;
  const range = itemKcalRange(dish, item.grams);

  if (!dish) {
    return (
      <div className="entry__panel">
        <div className="grid">
          <dt>份量</dt>
          <dd>
            {item.portionLabel} · {item.grams} 克
          </dd>
          <dt>每100克</dt>
          <dd>暂无数据</dd>
          <dt>出处</dt>
          <dd>用户手写补录</dd>
        </div>
        <div className="note">
          标记为待估算：热量不计入已估算值，周统计会显示「数据不完整」。
        </div>
      </div>
    );
  }

  return (
    <>
      <DishEvidence dish={dish} grams={item.grams} />
      {range && (
        <div className="detail">
          热量参考区间（按 {item.grams} 克）：{range[0]} ~ {range[1]} 千卡
        </div>
      )}
    </>
  );
}
