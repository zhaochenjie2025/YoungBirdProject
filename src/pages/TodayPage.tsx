// S39O-cs-today: 日期容器页，展示某一天的餐次与合计热量，可前后翻页查看历史。
// 实现 从全部记录里筛出当前查看的日期，按餐次分组列出，顶部给合计热量与待估算数量；
//      顶部日期翻页控件切换日期，每条记录就地展开「修改 / 删除」。
// 原理 合计永远从 meals 现算（dayStats），页面不缓存任何派生值，因此增删改后立即一致。
//      日期浏览做在 page 内部而非独立路由，是因为定稿导航只有四栏，
//      而 PRD 要求「按日期查看、修改和删除历史」，把三项能力挂在日期容器上可同时满足两边
//      （见 docs/PRD-INQUIRY.md）。
import { useState } from 'react';
import type { PageProps } from '../App';
import { dayStats, mealsOn, localDate, mealSummary } from '../domain/stats';
import { MEAL_SLOT_LABEL } from '../domain/types';
import { KcalBlock, MacroRow, ItemRow, PendingTag, Empty, Notice } from '../components/ui';
import { DateNav } from '../components/DateNav';
import { mealHref, editHref } from '../router';
import { DayAdvicePanel } from '../components/DayAdvicePanel';

export function TodayPage({ meals, settings, navigate }: PageProps) {
  const [date, setDate] = useState(() => localDate());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = localDate();
  const isToday = date === today;
  const dayMeals = mealsOn(meals.meals, date);
  const stats = dayStats(meals.meals, date);

  function handleDelete(id: string) {
    const ok = meals.removeMeal(id);
    if (!ok) {
      setError('删除失败：浏览器存储不可用，这条记录还在。');
    }
    setConfirmId(null);
  }

  return (
    <>
      <header className="app__header">
        <div>
          <h1 className="app__title">{isToday ? '今日' : '这一天'}</h1>
          <div className="app__sub">
            {stats.logged ? `已记录 ${stats.mealCount} 餐` : '还没有记录'}
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn--ghost" onClick={() => navigate('history')}>
            全部记录
          </button>
          <button className="btn btn--ghost" onClick={() => navigate('settings')}>
            设置
          </button>
        </div>
      </header>

      <DateNav date={date} onChange={setDate} />

      {!settings.hasKey && isToday && (
        <div className="notice notice--info">
          还没配置 DeepSeek API key。拍照识别不可用，搜索和手动记录仍可正常使用。
          <button className="btn btn--ghost" onClick={() => navigate('settings')}>
            去配置
          </button>
        </div>
      )}

      {error && (
        <Notice kind="error">
          {error}
          <button className="btn btn--ghost" onClick={() => setError(null)}>
            知道了
          </button>
        </Notice>
      )}

      <section className="card">
        {stats.logged ? (
          <>
            <KcalBlock
              kcal={stats.kcal}
              pendingCount={stats.pendingCount}
              caption={`已记录 ${stats.mealCount} 餐`}
            />
            <MacroRow nutrition={stats} />
          </>
        ) : (
          <Empty title={isToday ? '今天还没有记录' : '这一天还没有记录'}>
            {isToday ? '吃完一餐，拍下菜品就能快速记一笔。' : '可以继续往前翻，或者回到今天记一笔。'}
          </Empty>
        )}
      </section>

      <div className="section">
        <button className="btn btn--primary btn--block btn--lg" onClick={() => navigate('new')}>
          记录这一餐
        </button>
      </div>

      {dayMeals.length > 0 && (
        <section className="section">
          <div className="section__head">
            <span className="section__title">{isToday ? '今天的餐次' : '这一天的餐次'}</span>
          </div>
          {dayMeals.map((meal) => {
            const s = mealSummary(meal);
            const confirming = confirmId === meal.id;
            return (
              <div className="card" key={meal.id}>
                <div className="section__head" style={{ marginBottom: 'var(--s-2)' }}>
                  <span style={{ fontWeight: 600 }}>
                    {MEAL_SLOT_LABEL[meal.slot]} · {meal.time}
                  </span>
                  <span>
                    <PendingTag count={s.pendingCount} />{' '}
                    <span className="num">{s.kcal}</span> 千卡
                  </span>
                </div>
                {meal.items.map((it) => (
                  <ItemRow key={it.uid} item={it} />
                ))}

                {confirming ? (
                  <div className="actions actions--end">
                    <span className="confirm-q">确定删除这一餐？</span>
                    <button className="btn btn--ghost" onClick={() => setConfirmId(null)}>
                      取消
                    </button>
                    <button
                      className="btn btn--danger"
                      onClick={() => handleDelete(meal.id)}
                    >
                      确认删除
                    </button>
                  </div>
                ) : (
                  <div className="actions actions--end">
                    <button
                      className="btn btn--ghost"
                      onClick={() => navigate(editHref(meal.id).slice(2))}
                    >
                      修改
                    </button>
                    <button
                      className="btn btn--ghost"
                      onClick={() => setConfirmId(meal.id)}
                    >
                      删除
                    </button>
                    <button
                      className="btn btn--ghost"
                      onClick={() => navigate(mealHref(meal.id).slice(2))}
                    >
                      查看明细
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {dayMeals.length > 0 && (
        <section className="section">
          <DayAdvicePanel
            date={date}
            meals={dayMeals}
            stats={stats}
            settings={settings}
            navigate={navigate}
          />
        </section>
      )}
    </>
  );
}
