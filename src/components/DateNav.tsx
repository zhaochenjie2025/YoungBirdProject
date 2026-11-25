// S39O-cs-datenav: 日期翻页控件，让「今日」页变成一个可以往前翻的日期容器。
// 实现 给定当前日期与回调，渲染「前一日 / 日期标签 / 后一日」三段，后一日在今天时禁用。
// 原理 PRD 要求「历史页支持按日期查看」，而定稿导航只有四栏、没有历史格；
// 把日期浏览做成今日页内部的一个控件，历史能力由结构自然长出来，导航不必改动，
// 美术方案与 PRD 能力因此不冲突（见 docs/PRD-INQUIRY.md）。
import { addDays, localDate, parseLocalDate, weekdayLabel } from '../domain/stats';

export interface DateNavProps {
  /** 当前查看的日期，YYYY-MM-DD。 */
  date: string;
  /** 切换到指定日期。 */
  onChange: (date: string) => void;
}

/** 「今天」「昨天」这类相对称呼，其余显示月/日。 */
function relativeLabel(date: string): string {
  const today = localDate();
  if (date === today) return '今天';
  if (date === addDays(today, -1)) return '昨天';
  if (date === addDays(today, -2)) return '前天';
  return '';
}

export function DateNav({ date, onChange }: DateNavProps) {
  const today = localDate();
  const isToday = date === today;
  const d = parseLocalDate(date);
  const rel = relativeLabel(date);
  const stamp = `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  const week = `星期${weekdayLabel(date)}`;

  return (
    <div className="datenav" role="group" aria-label="切换日期">
      <button
        type="button"
        className="datenav__btn"
        onClick={() => onChange(addDays(date, -1))}
        aria-label="前一天"
      >
        ‹
      </button>

      <div className="datenav__label">
        <b>{rel || stamp}</b>
        <span>
          {rel ? stamp : ''} {week}
        </span>
      </div>

      <button
        type="button"
        className="datenav__btn"
        onClick={() => onChange(addDays(date, 1))}
        disabled={isToday}
        aria-label="后一天"
      >
        ›
      </button>
    </div>
  );
}
