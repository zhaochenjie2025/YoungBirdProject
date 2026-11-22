// S39O-cs-today: 今日页，展示今天的餐次与合计热量，并提供新的记录入口。
// 实现 从全部记录里筛出今天，按餐次分组列出，顶部给合计热量与待估算数量。
// 原理 合计永远从 meals 现算（dayStats），页面不缓存任何派生值，因此增删改后立即一致。
import type { PageProps } from '../App';
import { dayStats, mealsOn, localDate, mealSummary } from '../domain/stats';
import { MEAL_SLOT_LABEL } from '../domain/types';
import { KcalBlock, MacroRow, ItemRow, PendingTag, Empty } from '../components/ui';
import { mealHref } from '../router';
import { DayAdvicePanel } from '../components/DayAdvicePanel';

export function TodayPage({ meals, settings, navigate }: PageProps) {
  const today = localDate();
  const todayMeals = mealsOn(meals.meals, today);
  const stats = dayStats(meals.meals, today);

  return (
    <>
      <header className="app__header">
        <div>
          <h1 className="app__title">今日</h1>
          <div className="app__sub">{today}</div>
        </div>
        <button className="btn btn--ghost" onClick={() => navigate('settings')}>
          设置
        </button>
      </header>

      {!settings.hasKey && (
        <div className="notice notice--info">
          还没配置 DeepSeek API key。拍照识别不可用，搜索和手动记录仍可正常使用。
          <button className="btn btn--ghost" onClick={() => navigate('settings')}>
            去配置
          </button>
        </div>
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
          <Empty title="今天还没有记录">
            吃完一餐，拍下菜品就能快速记一笔。
          </Empty>
        )}
      </section>

      <div className="section">
        <button className="btn btn--primary btn--block btn--lg" onClick={() => navigate('new')}>
          记录这一餐
        </button>
      </div>

      {todayMeals.length > 0 && (
        <section className="section">
          <div className="section__head">
            <span className="section__title">今天的餐次</span>
          </div>
          {todayMeals.map((meal) => {
            const s = mealSummary(meal);
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
                <div className="actions actions--end">
                  <button className="btn btn--ghost" onClick={() => navigate(mealHref(meal.id).slice(2))}>
                    查看明细
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {todayMeals.length > 0 && (
        <section className="section">
          <DayAdvicePanel
            date={today}
            meals={todayMeals}
            stats={stats}
            settings={settings}
            navigate={navigate}
          />
        </section>
      )}
    </>
  );
}
