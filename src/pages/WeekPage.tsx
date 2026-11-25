// S39O-cs-week: 周视图，最近七天的分色堆叠柱与本周营养构成。
// 实现 从 weekStats 生成七天格子，柱高按 yMax（最大值上浮 25% 后取整到 500）归一，
//      柱内按供能占比分蛋白/脂肪/碳水三段，另画周平均虚线与三档刻度；未记录日为斜纹占位，
//      轻点某天在下方显示当日菜品。
// 原理 柱内按「供能占比」而非克数分段，因为脂肪 9 千卡/克、蛋白碳水 4 千卡/克，
//      按克数画会与热量读感对不上；y 轴上浮留白是为了让最高柱不贴顶，
//      未记录日用斜纹而非零高柱，避免「没记录」被读成「吃了 0 千卡」。
import { useState } from 'react';
import type { PageProps } from '../App';
import { weekStats, localDate, parseLocalDate } from '../domain/stats';
import { macroShare } from '../domain/nutrition';
import { mealHref } from '../router';

const WEEK_LABEL = ['日', '一', '二', '三', '四', '五', '六'];
const Y_TICKS = [1, 0.5, 0];

function fmtInt(n: number): string {
  return n.toLocaleString('zh-CN');
}

export function WeekPage({ meals, navigate }: PageProps) {
  const cells = weekStats(meals.meals);
  const today = localDate();
  const [active, setActive] = useState(() => Math.max(0, cells.findIndex((c) => c.date === today)));

  const logged = cells.filter((c) => c.logged);
  const maxK = Math.max(1, ...logged.map((c) => c.kcal));
  const yMax = Math.ceil((maxK * 1.25) / 500) * 500 || 500;
  const pct = (k: number) => Math.max(0, Math.min(100, (k / yMax) * 100));

  // 周平均只统计「记录完整」的天（无待估算），因为有待估算的日合计偏低。
  const full = logged.filter((c) => c.pendingCount === 0);
  const avg = full.length ? Math.round(full.reduce((a, c) => a + c.kcal, 0) / full.length) : 0;
  const weekKcal = logged.reduce((a, c) => a + c.kcal, 0);

  // 本周营养构成：沿用供能占比，只取完整日。
  const p = full.reduce((a, c) => a + (c.protein ?? 0), 0);
  const f = full.reduce((a, c) => a + (c.fat ?? 0), 0);
  const cb = full.reduce((a, c) => a + (c.carbs ?? 0), 0);
  const comp = full.length ? macroShare({ protein: p, fat: f, carbs: cb }) : null;

  const activeCell = cells[active];

  return (
    <>
      <header className="app__header">
        <div>
          <h1 className="app__title">最近七天</h1>
          <div className="app__sub">
            <b className="num">{fmtInt(weekKcal)}</b> 千卡 · 已记录 {logged.length} 天
          </div>
        </div>
      </header>

      <div className="album-chart">
        <div className="wedge__plot">
          <div className="wedge__area">
            {Y_TICKS.map((t) => (
              <div
                key={t}
                className={`wgrid${t === 0 ? ' wgrid--base' : ''}`}
                style={{ bottom: `${t * 100}%` }}
              />
            ))}
            {avg > 0 && <div className="wavg" style={{ bottom: `${pct(avg)}%` }} />}

            <div className="wcols">
              {cells.map((c, i) => {
                const isToday = c.date === today;
                const share = c.logged
                  ? macroShare({ protein: c.protein, fat: c.fat, carbs: c.carbs })
                  : null;
                const state = !c.logged ? 'empty' : c.pendingCount > 0 ? 'partial' : 'full';
                const d = parseLocalDate(c.date);
                return (
                  <button
                    type="button"
                    key={c.date}
                    className={[
                      'wcol',
                      `wcol--${state}`,
                      isToday ? 'wcol--today' : '',
                      i === active ? 'is-active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => setActive(i)}
                    aria-pressed={i === active}
                    aria-label={`${d.getMonth() + 1}月${d.getDate()}日 ${c.logged ? `${c.kcal}千卡` : '未记录'}`}
                  >
                    <div className="wcol__win" />
                    <span className="wcol__no">
                      {d.getDate()}
                      <i>日</i>
                    </span>

                    {c.logged && (
                      <span className="wcol__val" style={{ bottom: `calc(${pct(c.kcal).toFixed(2)}% + 4px)` }}>
                        {fmtInt(c.kcal)}
                        {state === 'partial' && <span className="wcol__star">*</span>}
                      </span>
                    )}

                    {c.logged ? (
                      <div className="wbar" style={{ height: `${pct(c.kcal).toFixed(2)}%` }}>
                        {share &&
                          share.carbs > 0.002 && (
                            <i className="band band--c" style={{ height: `${(share.carbs * 100).toFixed(2)}%` }} />
                          )}
                        {share && share.fat > 0.002 && (
                          <i className="band band--f" style={{ height: `${(share.fat * 100).toFixed(2)}%` }} />
                        )}
                        {share && share.protein > 0.002 && (
                          <i className="band band--p" style={{ height: `${(share.protein * 100).toFixed(2)}%` }} />
                        )}
                      </div>
                    ) : (
                      <div className="wcol__ghost" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="wedge__yaxis">
            {Y_TICKS.map((t) => (
              <span key={t} className="wytick" style={{ bottom: `${t * 100}%` }}>
                {t === 0 ? '0' : fmtInt(Math.round(yMax * t))}
              </span>
            ))}
            {avg > 0 && (
              <span className="wytick wytick--avg" style={{ bottom: `${pct(avg)}%` }}>
                均{fmtInt(avg)}
              </span>
            )}
          </div>
        </div>

        <div className="wedge__xlab">
          {cells.map((c) => {
            const isToday = c.date === today;
            return (
              <span
                key={c.date}
                className={`wcol__lab${isToday ? ' wcol__lab--today' : ''}${
                  c.logged ? '' : ' wcol__lab--empty'
                }`}
              >
                {isToday ? '今' : `周${WEEK_LABEL[parseLocalDate(c.date).getDay()]}`}
              </span>
            );
          })}
        </div>
      </div>

      {activeCell && (
        <div className="wk-loupe">
          <div className="wk-loupe__top">
            <b>
              {parseLocalDate(activeCell.date).getMonth() + 1}/{parseLocalDate(activeCell.date).getDate()}（周
              {WEEK_LABEL[parseLocalDate(activeCell.date).getDay()]}）
            </b>
            <span>
              {activeCell.logged
                ? `${fmtInt(activeCell.kcal)} 千卡${activeCell.pendingCount > 0 ? ' · 含待估算' : ''}`
                : '未记录'}
            </span>
          </div>
          <div className="wk-loupe__dishes">
            {activeCell.logged ? (
              <ActiveDayMeals meals={meals.meals.filter((m) => m.date === activeCell.date)} navigate={navigate} cell={activeCell} />
            ) : (
              '这一天暂时留白，不计入本周日均。'
            )}
          </div>
        </div>
      )}

      {comp && (
        <div className="wcomp">
          <div className="wcomp__t">
            <b>本周营养构成</b>
            <span>按供能占比</span>
          </div>
          <div className="wcomp__bar">
            <i className="wcomp__seg wcomp__seg--p" style={{ width: `${(comp.protein * 100).toFixed(1)}%` }} />
            <i className="wcomp__seg wcomp__seg--f" style={{ width: `${(comp.fat * 100).toFixed(1)}%` }} />
            <i className="wcomp__seg wcomp__seg--c" style={{ width: `${(comp.carbs * 100).toFixed(1)}%` }} />
          </div>
          <div className="wcomp__keys">
            <div className="wcomp__k">
              <span className="dot wcomp__dot--p" />蛋白<b>{(comp.protein * 100).toFixed(1)}%</b>
            </div>
            <div className="wcomp__k">
              <span className="dot wcomp__dot--f" />脂肪<b>{(comp.fat * 100).toFixed(1)}%</b>
            </div>
            <div className="wcomp__k">
              <span className="dot wcomp__dot--c" />碳水<b>{(comp.carbs * 100).toFixed(1)}%</b>
            </div>
          </div>
        </div>
      )}

      <div className="wk-note">
        轻点任意一天可查看当日菜品；<b>*</b> 表示含待估算，虚线为完整日均值（{fmtInt(avg)} 千卡）。
      </div>
    </>
  );
}

/** 选中日的菜品列表，点击进入单餐明细。 */
function ActiveDayMeals({
  meals,
  navigate,
  cell,
}: {
  meals: import('../domain/types').Meal[];
  navigate: (to: string) => void;
  cell: import('../domain/types').WeekCell;
}) {
  return (
    <>
      {meals
        .slice()
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((m) => (
          <button key={m.id} className="result" onClick={() => navigate(mealHref(m.id).slice(2))}>
            <span className="result__meta">
              {m.time} · {m.items.map((i) => i.name).join('、')}
            </span>
          </button>
        ))}
      <div style={{ marginTop: 'var(--s-2)', fontSize: 'var(--t-xs)', color: 'var(--ink3)' }}>
        共 {cell.mealCount} 餐
      </div>
    </>
  );
}
