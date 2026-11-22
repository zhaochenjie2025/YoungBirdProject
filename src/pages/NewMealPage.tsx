// S39O-cs-newmeal: 新建/编辑一餐的草稿页，拍照、搜索、手动补录共用同一份草稿。
// 实现 草稿含物品列表与餐次时间；每个物品先选菜品再选份量，任何一步失败都不丢已加内容。
// 原理 识别失败只影响「本次添加」这一步，草稿列表是独立状态，所以 PRD 要求的
// 「识别超时后已添加菜品仍保留」是状态结构保证，不需要额外的恢复逻辑。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PageProps } from '../App';
import type { Dish, MealItem, MealSlot } from '../domain/types';
import { MEAL_SLOT_LABEL } from '../domain/types';
import { computeCustomItem, computeItem, formatGrams, summarizeItems } from '../domain/nutrition';
import { localDate, localTime, defaultSlot, newId } from '../domain/stats';
import { recognizeDish, downscaleImage, type Candidate } from '../vision/recognize';
import { ApiError, apiErrorText } from '../vision/client';
import { searchDishes } from '../data/search';
import { allDishes, getDish } from '../data/dishes';
import { KcalBlock, MacroRow, Notice, ItemRow, PendingTag } from '../components/ui';
import { mealHref } from '../router';

type DraftItem = Omit<MealItem, 'uid'> & { uid: string };

/** 单道菜克数的合理上限：超过这个值几乎一定是输入错误。 */
const MAX_GRAMS = 5000;

/** 把用户输入的文本解析成克数；非法或超限返回 null。 */
function parseGrams(text: string): number | null {
  const g = Number(text);
  if (!Number.isFinite(g) || g <= 0 || g > MAX_GRAMS) return null;
  return g;
}

/** 为菜品挑一个默认份量：标准份。 */
function standardGrams(dish: Dish): number {
  return dish.portions.find((p) => p.key === 'standard')?.grams ?? dish.portions[0]?.grams ?? 100;
}

interface PickerState {
  dish: Dish;
  grams: number;
  portionLabel: string;
}

export function NewMealPage({ meals, settings, navigate, editId }: PageProps & { editId?: string }) {
  const editing = editId ? meals.meals.find((m) => m.id === editId) : undefined;
  const [items, setItems] = useState<DraftItem[]>(() =>
    editing
      ? editing.items.map((it) => ({ ...it }))
      : [],
  );
  const [date, setDate] = useState(editing?.date ?? localDate());
  const [time, setTime] = useState(editing?.time ?? localTime());
  const [slot, setSlot] = useState<MealSlot>(editing?.slot ?? defaultSlot());

  const summary = useMemo(() => summarizeItems(items as MealItem[]), [items]);
  const isEditing = Boolean(editing);

  function addItem(item: Omit<MealItem, 'uid'>) {
    setItems((prev) => [...prev, { ...item, uid: newId() }]);
  }

  function updateItem(uid: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));
  }

  function removeItem(uid: string) {
    setItems((prev) => prev.filter((it) => it.uid !== uid));
  }

  function handleSave() {
    if (items.length === 0) return;
    const meal = meals.saveMeal({
      id: editing?.id,
      date,
      time,
      slot,
      items: items.map(({ uid: _uid, ...rest }) => rest),
    });
    // 写盘失败时不跳转：留在本页，顶部横幅会说明原因，用户可重试或导出。
    if (meal) navigate(mealHref(meal.id).slice(2));
  }

  return (
    <>
      <header className="app__header">
        <div>
          <h1 className="app__title">{isEditing ? '修改这一餐' : '记录这一餐'}</h1>
          <div className="app__sub">拍照识别、搜索或手动补录，可以混着用</div>
        </div>
        <button className="btn btn--ghost" onClick={() => navigate('today')}>
          取消
        </button>
      </header>

      <AddDish
        apiKey={settings.apiKey}
        hasKey={settings.hasKey}
        onPick={(item) => addItem(item)}
      />

      <section className="section">
        <div className="section__head">
          <span className="section__title">这一餐的菜品（{items.length}）</span>
        </div>
        {items.length === 0 ? (
          <div className="card">
            <div style={{ color: 'var(--ink-3)', fontSize: 'var(--t-sm)' }}>
              还没有添加菜品。先拍一张，或者搜索添加。
            </div>
          </div>
        ) : (
          <div className="card">
            {items.map((it) => (
              <DraftItemRow
                key={it.uid}
                item={it}
                onChange={(patch) => updateItem(it.uid, patch)}
                onRemove={() => removeItem(it.uid)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card section">
        <KcalBlock kcal={summary.kcal} pendingCount={summary.pendingCount} />
        <MacroRow nutrition={summary} />
      </section>

      <section className="card section">
        <div className="field">
          <label className="field__label" htmlFor="slot">
            餐次
          </label>
          <select
            id="slot"
            className="select"
            value={slot}
            onChange={(e) => setSlot(e.target.value as MealSlot)}
          >
            {(Object.keys(MEAL_SLOT_LABEL) as MealSlot[]).map((s) => (
              <option key={s} value={s}>
                {MEAL_SLOT_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="date">
            日期
          </label>
          <input
            id="date"
            type="date"
            className="input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="time">
            时间
          </label>
          <input
            id="time"
            type="time"
            className="input"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </section>

      <div className="actions">
        <button
          className="btn btn--primary btn--block btn--lg"
          disabled={items.length === 0}
          onClick={handleSave}
        >
          {isEditing ? '保存修改' : '保存这一餐'}
        </button>
      </div>
    </>
  );
}

/** 草稿中的一个菜品行：可改份量、可删除。 */
function DraftItemRow({
  item,
  onChange,
  onRemove,
}: {
  item: DraftItem;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
}) {
  const dish = item.dishId ? getDish(item.dishId) : undefined;
  const [custom, setCustom] = useState(false);
  const [gramsText, setGramsText] = useState(String(item.grams));

  useEffect(() => {
    setGramsText(String(item.grams));
  }, [item.grams]);

  function applyGrams(g: number, label: string) {
    if (dish) {
      const next = computeItem(dish, g, label);
      onChange(next);
    } else {
      const next = computeCustomItem(item.name, g);
      onChange({ ...next, portionLabel: label });
    }
  }

  return (
    <div>
      <ItemRow
        item={{ ...item, uid: item.uid }}
        trailing={
          <button className="btn btn--ghost" aria-label={`删除 ${item.name}`} onClick={onRemove}>
            删除
          </button>
        }
      />
      {!custom && dish ? (
        <div className="portions" style={{ paddingBottom: 'var(--s-3)' }}>
          {dish.portions.map((p) => (
            <button
              key={p.key}
              className="portion"
              aria-pressed={item.portionLabel === p.label && item.grams === p.grams}
              onClick={() => applyGrams(p.grams, p.label)}
            >
              {p.label}
              <span className="portion__grams num">{p.grams}g</span>
            </button>
          ))}
          <button
            className="portion"
            aria-pressed={false}
            onClick={() => {
              setCustom(true);
            }}
          >
            自定义克数
          </button>
        </div>
      ) : (
        <div className="portions" style={{ paddingBottom: 'var(--s-3)' }}>
          <input
            className="input"
            style={{ width: 120 }}
            inputMode="decimal"
            value={gramsText}
            aria-label="克数"
            onChange={(e) => setGramsText(e.target.value)}
            onBlur={() => {
              const g = parseGrams(gramsText);
              if (g === null) {
                // 非法输入不静默忽略：回写为当前实际克数，让输入框与真实值一致。
                setGramsText(String(item.grams));
                return;
              }
              applyGrams(g, '自定义');
            }}
          />
          <span className="portion__grams">克</span>
          {dish && (
            <button
              className="portion"
              onClick={() => {
                // 允许回到预设份量，否则选了自定义就再也点不回来。
                setCustom(false);
                setGramsText(String(item.grams));
              }}
            >
              用预设份量
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 添加入口：拍照 / 搜索 / 手动。 */
function AddDish({
  apiKey,
  hasKey,
  onPick,
}: {
  apiKey: string;
  hasKey: boolean;
  onPick: (item: Omit<MealItem, 'uid'>) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState<Candidate[] | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'search' | 'manual'>('idle');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setPicking(null);
    if (!hasKey) {
      setError('未配置 API key，无法识别。可以用搜索或手动补录。');
      return;
    }
    setRecognizing(true);
    try {
      const dataUrl = await downscaleImage(file);
      setPreview(dataUrl);
      const result = await recognizeDish(apiKey, dataUrl);
      if (result.candidates.length === 0) {
        setError('没认出来。可以重拍、搜索，或手动记录。');
      } else {
        setPicking(result.candidates);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? apiErrorText(err.kind) : '识别失败';
      setError(`${msg}。已添加的菜品不受影响，可以继续搜索或手动记录。`);
    } finally {
      setRecognizing(false);
    }
  }

  function chooseCandidate(dish: Dish) {
    setPicking(null);
    setPreview(null);
    setError(null);
    // 选定菜品后进入份量选择
    setPortionFor({ dish, grams: standardGrams(dish), portionLabel: '标准份' });
  }

  const [portionFor, setPortionFor] = useState<PickerState | null>(null);
  const [customGrams, setCustomGrams] = useState('');
  const [search, setSearch] = useState('');
  const results = useMemo(() => (search.trim() ? searchDishes(search, 10) : []), [search]);

  return (
    <section className="section" style={{ marginTop: 0 }}>
      {/* 拍与选分成两个 input：带 capture 的会强制开相机，不给相册入口，
          与 PRD「可直接拍摄，也可从相册选择」冲突，因此分开。 */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={onFile}
      />
      <input
        ref={albumRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={onFile}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 'var(--s-2)' }}>
        <button
          className={`capture ${hasKey ? '' : 'capture--disabled'}`}
          onClick={() => {
            setError(null);
            if (!hasKey) {
              setError('未配置 API key。先在设置里填入才能拍照识别；也可以搜索或手动补录。');
              return;
            }
            cameraRef.current?.click();
          }}
          aria-disabled={recognizing}
        >
          <span className="capture__icon" aria-hidden="true">
            📷
          </span>
          {recognizing ? '正在识别…' : '拍一张'}
          <span className="capture__hint">
            {hasKey ? '单道菜一张，识别后由你确认' : '需要先在设置中配置 API key'}
          </span>
        </button>
        <button
          className={`capture ${hasKey ? '' : 'capture--disabled'}`}
          onClick={() => {
            setError(null);
            if (!hasKey) {
              setError('未配置 API key。先在设置里填入才能拍照识别；也可以搜索或手动补录。');
              return;
            }
            albumRef.current?.click();
          }}
          aria-disabled={recognizing}
        >
          <span className="capture__icon" aria-hidden="true">
            🖼
          </span>
          从相册选
        </button>
      </div>

      {preview && recognizing && (
        <div style={{ marginTop: 'var(--s-2)', fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>
          已选照片，正在请求识别…
        </div>
      )}

      {error && <Notice kind="warn">{error}</Notice>}

      {picking && (
        <div className="card" style={{ marginTop: 'var(--s-3)' }}>
          <div className="section__title" style={{ marginBottom: 'var(--s-2)' }}>
            识别结果，请选一个
          </div>
          {picking.map((c) => (
            <button key={c.dish.id} className="result" onClick={() => chooseCandidate(c.dish)}>
              <div className="result__name">
                {c.dish.name}{' '}
                <span className="tag num">{(c.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="result__meta">
                {c.dish.cooking} · 每 100 克 <span className="num">{c.dish.per100g.kcal ?? '暂无'}</span> 千卡
              </div>
            </button>
          ))}
          <div className="actions">
            <button className="btn btn--ghost" onClick={() => { setPicking(null); setPreview(null); }}>
              都不是，重新拍
            </button>
            <button className="btn btn--ghost" onClick={() => { setPicking(null); setMode('search'); }}>
              用搜索添加
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setPicking(null);
                setMode('manual');
              }}
            >
              手动记录
            </button>
          </div>
        </div>
      )}

      {portionFor && (
        <div className="card" style={{ marginTop: 'var(--s-3)' }}>
          <div className="section__title" style={{ marginBottom: 'var(--s-2)' }}>
            {portionFor.dish.name} · 你吃了多少？
          </div>
          <div className="portions">
            {portionFor.dish.portions.map((p) => (
              <button
                key={p.key}
                className="portion"
                aria-pressed={portionFor.portionLabel === p.label}
                onClick={() =>
                  setPortionFor({ ...portionFor, grams: p.grams, portionLabel: p.label })
                }
              >
                {p.label}
                <span className="portion__grams num">{p.grams}g</span>
              </button>
            ))}
          </div>
          <div className="field">
            <label className="field__label">或直接填克数</label>
            <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
              <input
                className="input"
                style={{ width: 120 }}
                inputMode="decimal"
                placeholder={String(portionFor.grams)}
                value={customGrams}
                onChange={(e) => {
                  setCustomGrams(e.target.value);
                  const g = parseGrams(e.target.value);
                  if (g !== null) {
                    setPortionFor({ ...portionFor, grams: g, portionLabel: '自定义' });
                  }
                }}
              />
              <span>克</span>
            </div>
          </div>
          <div className="actions">
            <button
              className="btn btn--primary"
              onClick={() => {
                onPick(computeItem(portionFor.dish, portionFor.grams, portionFor.portionLabel));
                setPortionFor(null);
                setCustomGrams('');
              }}
            >
              加入这一餐（<span className="num">{formatGrams(portionFor.grams)}</span> 克）
            </button>
            <button className="btn btn--ghost" onClick={() => setPortionFor(null)}>
              取消
            </button>
          </div>
        </div>
      )}

      <div className="actions">
        <button className="btn" onClick={() => setMode(mode === 'search' ? 'idle' : 'search')}>
          {mode === 'search' ? '收起搜索' : '搜索菜品'}
        </button>
        <button className="btn" onClick={() => setMode(mode === 'manual' ? 'idle' : 'manual')}>
          {mode === 'manual' ? '收起手动' : '手动补录'}
        </button>
      </div>

      {mode === 'search' && (
        <div className="card" style={{ marginTop: 'var(--s-3)' }}>
          <input
            className="input"
            placeholder="输入菜名或别名，如「番茄炒蛋」「西红柿炒鸡蛋」"
            value={search}
            autoFocus
            onChange={(e) => setSearch(e.target.value)}
          />
          {search.trim() && results.length === 0 && (
            <div style={{ marginTop: 'var(--s-2)', fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>
              没找到匹配的菜品。可以换关键词，或用手动补录。
            </div>
          )}
          {results.length > 0 && (
            <div className="results">
              {results.map((d) => (
                <button
                  key={d.id}
                  className="result"
                  onClick={() => {
                    setMode('idle');
                    setSearch('');
                    setPortionFor({ dish: d, grams: standardGrams(d), portionLabel: '标准份' });
                  }}
                >
                  <div className="result__name">{d.name}</div>
                  <div className="result__meta">
                    {d.cooking} · 每 100 克 <span className="num">{d.per100g.kcal ?? '暂无'}</span> 千卡
                  </div>
                </button>
              ))}
            </div>
          )}
          <div style={{ marginTop: 'var(--s-2)', fontSize: 'var(--t-xs)', color: 'var(--ink-3)' }}>
            库里共 {allDishes().length} 道菜
          </div>
        </div>
      )}

      {mode === 'manual' && <ManualEntry onSubmit={(it) => { onPick(it); setMode('idle'); }} />}
    </section>
  );
}

/** 菜品库外的手动补录：只有菜名与克数，必然待估算。 */
function ManualEntry({ onSubmit }: { onSubmit: (item: Omit<MealItem, 'uid'>) => void }) {
  const [name, setName] = useState('');
  const [grams, setGrams] = useState('150');

  return (
    <div className="card" style={{ marginTop: 'var(--s-3)' }}>
      <div className="section__title" style={{ marginBottom: 'var(--s-2)' }}>
        手动补录（会标记为待估算）
      </div>
      <div className="field">
        <label className="field__label">菜名</label>
        <input
          className="input"
          placeholder="如「食堂自制凉皮」"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field__label">大约吃了多少克（1~5000）</label>
        <input
          className="input"
          inputMode="decimal"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
        />
      </div>
      <div className="actions">
        <button
          className="btn btn--primary"
          disabled={!name.trim() || parseGrams(grams) === null}
          onClick={() => {
            const g = parseGrams(grams);
            if (g !== null) onSubmit(computeCustomItem(name.trim(), g));
          }}
        >
          加入这一餐
        </button>
      </div>
    </div>
  );
}

export { PendingTag };
