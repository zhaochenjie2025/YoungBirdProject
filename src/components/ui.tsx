// S39O-cs-ui: 全应用共用的展示组件，只管怎么显示、不做业务判断。
// 实现 热量块、宏量营养行、条目行、状态标签、按钮与通知条。
// 原理 数值缺失一律走同一个格式化函数，确保「暂无数据」在每一处都长一样，
// UI 不自行解释 null 的语义，避免同一缺失状态在不同页面显示成不同文案。
import type { ReactNode } from 'react';
import type { Nutrition, MealItem } from '../domain/types';
import type { Dish } from '../domain/types';
import { formatGrams, scaleNutrition, roundNutrition } from '../domain/nutrition';
import { dishPhoto } from '../data/photos';

export function Num({ children }: { children: ReactNode }) {
  return <span className="num">{children}</span>;
}

export function KcalBlock({
  kcal,
  pendingCount,
  caption,
}: {
  kcal: number;
  pendingCount: number;
  caption?: string;
}) {
  return (
    <div>
      <div className="kcal-block">
        <span className="kcal-num num">{pendingCount > 0 ? '≈' : ''}{kcal}</span>
        <span className="kcal-unit">千卡</span>
      </div>
      {pendingCount > 0 && (
        <div className="kcal-caption">
          已估算热量，另有 <Num>{pendingCount}</Num> 道菜待估算
        </div>
      )}
      {caption && <div className="kcal-caption">{caption}</div>}
    </div>
  );
}

function Macro({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div>
      <div className="macro__label">{label}</div>
      {value === null ? (
        <div className="macro__value macro__value--none">暂无数据</div>
      ) : (
        <div className="macro__value">
          <Num>{value}</Num> {unit}
        </div>
      )}
    </div>
  );
}

export function MacroRow({ nutrition }: { nutrition: Nutrition }) {
  return (
    <div className="macros">
      <Macro label="蛋白质" value={nutrition.protein} unit="克" />
      <Macro label="脂肪" value={nutrition.fat} unit="克" />
      <Macro label="碳水" value={nutrition.carbs} unit="克" />
    </div>
  );
}

export function PendingTag({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="tag tag--warn">待估算 {count}</span>;
}

export function ItemRow({
  item,
  onClick,
  trailing,
}: {
  item: MealItem;
  onClick?: () => void;
  trailing?: ReactNode;
}) {
  const photo = dishPhoto(item.dishId);
  const body = (
    <>
      {photo ? (
        <img className="item__thumb" src={photo} alt="" loading="lazy" width="48" height="48" />
      ) : (
        <span className="item__thumb item__thumb--blank" aria-hidden="true" />
      )}
      <div className="item__main">
        <div className="item__name">
          {item.name}
          {item.pending && <span className="tag tag--warn">待估算</span>}
        </div>
        <div className="item__meta">
          {item.portionLabel} · <Num>{formatGrams(item.grams)}</Num> 克
        </div>
      </div>
      {item.pending || item.nutrition.kcal === null ? (
        <div className="item__kcal item__kcal--none">暂无数据</div>
      ) : (
        <div className="item__kcal">
          <Num>{Math.round(item.nutrition.kcal ?? 0)}</Num> 千卡
        </div>
      )}
      {trailing}
    </>
  );

  if (onClick) {
    return (
      <button className="item" style={{ width: '100%', textAlign: 'left' }} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <div className="item">{body}</div>;
}

export function Notice({ kind, children }: { kind: 'warn' | 'error' | 'info'; children: ReactNode }) {
  return <div className={`notice notice--${kind}`}>{children}</div>;
}

export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {children && <div>{children}</div>}
      {action && <div style={{ marginTop: 'var(--s-4)' }}>{action}</div>}
    </div>
  );
}

/** 菜品估算依据的展开内容。 */
export function DishEvidence({ dish, grams }: { dish: Dish; grams: number }) {
  const p = dish.per100g;
  const raw = scaleNutrition(p, grams);
  const scaled = roundNutrition(raw);
  return (
    <div className="detail">
      <div className="detail__row">
        <span>参考条目</span>
        <span>{dish.name}（每 100 克）</span>
      </div>
      <div className="detail__row">
        <span>热量</span>
        <span>
          <Num>{p.kcal ?? '暂无'}</Num> 千卡 / 100 克
        </span>
      </div>
      <div className="detail__row">
        <span>每 100 克含量</span>
        <span>
          蛋白 <Num>{p.protein ?? '—'}</Num> · 脂肪 <Num>{p.fat ?? '—'}</Num> · 碳水{' '}
          <Num>{p.carbs ?? '—'}</Num> 克
        </span>
      </div>
      <div className="detail__row">
        <span>
          按 <Num>{formatGrams(grams)}</Num> 克折算
        </span>
        <span>
          蛋白 <Num>{scaled.protein ?? '—'}</Num> · 脂肪 <Num>{scaled.fat ?? '—'}</Num> · 碳水{' '}
          <Num>{scaled.carbs ?? '—'}</Num> 克
        </span>
      </div>
      <div style={{ marginTop: 'var(--s-2)' }}>
        营养数据出处：{dish.source.name}
        {dish.source.note ? `（${dish.source.note}）` : ''}
      </div>
      <div>
        份量依据：{dish.portionSource.name}
        {dish.portionSource.note ? `（${dish.portionSource.note}）` : ''}
      </div>
      {dish.kcalRange && (
        <div>
          参考区间：每 100 克 <Num>{dish.kcalRange[0]}</Num>~<Num>{dish.kcalRange[1]}</Num> 千卡
          {dish.rangeNote ? `，${dish.rangeNote}` : ''}
        </div>
      )}
    </div>
  );
}
