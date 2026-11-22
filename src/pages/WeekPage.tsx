// S39O-cs-week: 周视图，最近七天的热量格子，区分未记录与数据不完整。
// 实现 从 weekStats 生成七天格子，柱高按本周最大热量归一，今天高亮。
// 原理 柱高使用本周最大值做相对归一而非固定上限，记录量少时也能看出相对高低；
// 未记录与待估算用不同视觉状态，避免"没记录"被误读成"吃了 0 千卡"。
import type { PageProps } from '../App';
import { weekStats, weekdayLabel, localDate, parseLocalDate } from '../domain/stats';
import { mealHref } from '../router';

export function WeekPage({ meals, navigate }: PageProps) {
  const cells = weekStats(meals.meals);
  const max = Math.max(1, ...cells.map((c) => c.kcal));
  const today = localDate();

  return (
    <>
      <header className="app__header">
        <div>
          <h1 className="app__title">本周</h1>
          <div className="app__sub">最近七天的记录</div>
        </div>
      </header>

      <section className="card">
        <div className="week">
          {cells.map((c) => {
            const d = parseLocalDate(c.date);
            const isToday = c.date === today;
            const pct = Math.round((c.kcal / max) * 100);
            return (
              <div
                key={c.date}
                className={`week__cell${isToday ? ' week__cell--today' : ''}`}
                aria-current={isToday ? 'date' : undefined}
              >
                <div className="week__day">周{weekdayLabel(c.date)}</div>
                <div className="week__date">{d.getMonth() + 1}/{d.getDate()}</div>
                {c.logged ? (
                  <>
                    <div className="week__bar" style={{ height: `${Math.max(6, pct * 0.35)}px` }} />
                    <div className="week__kcal num">{c.kcal}</div>
                    {c.incomplete && <div className="tag tag--warn" style={{ fontSize: 9 }}>不完整</div>}
                  </>
                ) : (
                  <div className="week__none">未记录</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        {cells.filter((c) => c.logged).length === 0 ? (
          <div className="card">
            <div style={{ color: 'var(--ink-3)', fontSize: 'var(--t-sm)' }}>
              最近七天都没有记录。回「记录」开始记一餐。
            </div>
          </div>
        ) : (
          <>
            <div className="section__head">
              <span className="section__title">按天查看</span>
            </div>
            {cells
              .filter((c) => c.logged)
              .reverse()
              .map((c) => {
                const dayMeals = meals.meals.filter((m) => m.date === c.date);
                return (
                  <div className="card" key={c.date}>
                    <div className="section__head" style={{ marginBottom: 'var(--s-2)' }}>
                      <span style={{ fontWeight: 600 }}>
                        {c.date === today ? '今天' : c.date}
                      </span>
                      <span className="app__sub">
                        {c.pendingCount > 0 && <span className="tag tag--warn">待估算 {c.pendingCount}</span>}{' '}
                        <span className="num">{c.kcal}</span> 千卡 · {c.mealCount} 餐
                      </span>
                    </div>
                    {dayMeals
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((m) => (
                        <button
                          key={m.id}
                          className="result"
                          onClick={() => navigate(mealHref(m.id).slice(2))}
                        >
                          <span className="result__meta">
                            {m.time} · {m.items.map((i) => i.name).join('、')}
                          </span>
                        </button>
                      ))}
                  </div>
                );
              })}
          </>
        )}
      </section>
    </>
  );
}
