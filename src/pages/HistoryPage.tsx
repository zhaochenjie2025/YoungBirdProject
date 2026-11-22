// S39O-cs-history: 历史页，按日期倒序列出全部记录，支持进入明细与删除、导出导入。
// 实现 按日期分组渲染，每组给合计与待估算标记；提供 JSON 导出与导入。
// 原理 分组与合计全部由 meals 现算；导出导入走同一份 schema，保证换浏览器时数据可迁移。
import { useRef, useState } from 'react';
import type { PageProps } from '../App';
import { mealSummary } from '../domain/stats';
import { MEAL_SLOT_LABEL } from '../domain/types';
import { exportMeals, parseImport } from '../store/persistence';
import { Notice } from '../components/ui';
import { mealHref } from '../router';

export function HistoryPage({ meals, navigate }: PageProps) {
  const [importMsg, setImportMsg] = useState<{ kind: 'warn' | 'info'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sorted = [...meals.meals].sort((a, b) =>
    a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date),
  );

  const byDate = new Map<string, typeof sorted>();
  for (const m of sorted) {
    const arr = byDate.get(m.date) ?? [];
    arr.push(m);
    byDate.set(m.date, arr);
  }

  function doExport() {
    const text = exportMeals(meals.meals);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caloriesnap-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseImport(String(reader.result ?? ''));
      if (!parsed) {
        setImportMsg({ kind: 'warn', text: '文件格式不对，导入失败。' });
        return;
      }
      const existing = new Set(meals.meals.map((m) => m.id));
      const merged = [...meals.meals, ...parsed.filter((m) => !existing.has(m.id))];
      meals.replaceAll(merged);
      setImportMsg({ kind: 'info', text: `已导入 ${merged.length - meals.meals.length} 条新记录。` });
    };
    reader.readAsText(file);
  }

  return (
    <>
      <header className="app__header">
        <div>
          <h1 className="app__title">历史</h1>
          <div className="app__sub">共 {meals.meals.length} 条记录</div>
        </div>
        <button className="btn btn--ghost" onClick={() => navigate('settings')}>
          设置
        </button>
      </header>

      {importMsg && <Notice kind={importMsg.kind}>{importMsg.text}</Notice>}

      {sorted.length === 0 ? (
        <div className="card">
          <div style={{ color: 'var(--ink-3)', fontSize: 'var(--t-sm)' }}>
            还没有任何记录。回「记录」开始第一餐。
          </div>
        </div>
      ) : (
        [...byDate.entries()].map(([date, dayMeals]) => {
          const totalKcal = dayMeals.reduce((sum, m) => sum + mealSummary(m).kcal, 0);
          const pending = dayMeals.reduce((sum, m) => sum + mealSummary(m).pendingCount, 0);
          return (
            <section className="section" key={date}>
              <div className="section__head">
                <span className="section__title">{date}</span>
                <span className="app__sub">
                  {pending > 0 && <span className="tag tag--warn">待估算 {pending}</span>}{' '}
                  <span className="num">{totalKcal}</span> 千卡
                </span>
              </div>
              {dayMeals.map((meal) => {
                const s = mealSummary(meal);
                return (
                  <button
                    key={meal.id}
                    className="card"
                    style={{ width: '100%', textAlign: 'left', display: 'block' }}
                    onClick={() => navigate(mealHref(meal.id).slice(2))}
                  >
                    <div className="section__head" style={{ marginBottom: 0 }}>
                      <span>
                        <strong>{MEAL_SLOT_LABEL[meal.slot]}</strong>{' '}
                        <span className="app__sub">{meal.time}</span>
                      </span>
                      <span className="app__sub">
                        {meal.items.map((i) => i.name).join('、')}
                      </span>
                    </div>
                    <div style={{ marginTop: 'var(--s-1)', fontSize: 'var(--t-sm)' }}>
                      <span className="num">{s.kcal}</span> 千卡
                      {s.pendingCount > 0 && ` · ${s.pendingCount} 道待估算`}
                    </div>
                  </button>
                );
              })}
            </section>
          );
        })
      )}

      <section className="section">
        <div className="section__head">
          <span className="section__title">数据</span>
        </div>
        <div className="actions">
          <button className="btn" onClick={doExport} disabled={meals.meals.length === 0}>
            导出 JSON
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            导入 JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="sr-only" onChange={doImport} />
        </div>
        <div style={{ marginTop: 'var(--s-2)', fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>
          记录只存在这台设备的浏览器里。清理浏览器数据会丢失，换设备请用导出导入。
        </div>
      </section>
    </>
  );
}
