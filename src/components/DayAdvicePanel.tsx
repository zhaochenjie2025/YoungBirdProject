// S39O-cs-dayadvice: 按日生成膳食建议的共享面板，历史页与今日页共用。
// 实现 接收某一天的记录与统计，按钮触发请求，失败只在本区块提示，成功展示文本并标出异常数字。
// 原理 面板只依赖传进来的当日数据，不自己读存储，因此同一天数据变化后面板结论跟着变，
// 不会出现「历史页已改、建议还是旧的」这种不一致。
import { useEffect, useState } from 'react';
import type { Meal, DayStats } from '../domain/types';
import { generateDayAdvice, type AdviceResult } from '../advice/advice';
import { ApiError, apiErrorText } from '../vision/client';
import { Notice } from './ui';
import type { SettingsApi } from '../store/useSettings';

export function DayAdvicePanel({
  date,
  meals,
  stats,
  settings,
  navigate,
}: {
  date: string;
  meals: Meal[];
  stats: DayStats;
  settings: SettingsApi;
  navigate: (to: string) => void;
}) {
  const [advice, setAdvice] = useState<AdviceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 日期或当天数据变化时清空旧结论：否则改了记录、建议还在引用旧数值。
  useEffect(() => {
    setAdvice(null);
    setError(null);
  }, [date, meals, stats]);

  async function run() {
    if (!settings.hasKey) {
      setError('未配置 API key，无法生成建议。');
      return;
    }
    if (meals.length === 0) {
      setError('这一天还没有记录，无法生成建议。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await generateDayAdvice(settings.apiKey, {
        date,
        meals,
        stats,
        complete: stats.pendingCount === 0,
      });
      setAdvice(result);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorText(err.kind) : '生成失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="section__head" style={{ marginBottom: 'var(--s-3)' }}>
        <span className="section__title">这一天吃得怎么样</span>
      </div>
      {!advice && !loading && (
        <div style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', marginBottom: 'var(--s-3)' }}>
          根据当天所有餐食生成简短建议。数值来自上方统计，模型只做解释。
        </div>
      )}
      {loading && <div style={{ fontSize: 'var(--t-sm)' }}>正在生成建议…</div>}
      {error && (
        <>
          <Notice kind="warn">{error}</Notice>
          {!settings.hasKey && (
            <button className="btn btn--ghost" onClick={() => navigate('settings')}>
              去配置 key
            </button>
          )}
        </>
      )}
      {advice && (
        <>
          <div className="advice">{advice.text}</div>
          {advice.suspiciousNumbers.length > 0 && (
            <div style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 'var(--s-2)' }}>
              提示：建议里出现了统计中未给出的数值，请以上方数据为准。
            </div>
          )}
        </>
      )}
      <div className="advice__actions">
        <button className="btn" onClick={run} disabled={loading || meals.length === 0}>
          {advice ? '重新生成' : '生成这一天的建议'}
        </button>
      </div>
    </div>
  );
}
