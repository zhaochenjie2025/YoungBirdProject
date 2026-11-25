// S39O-cs-newmeal: 新建/编辑一餐的草稿页，复古拍立得机身取景器下拍照、搜索、手写共用同一份草稿。
// 实现 相机机身（取景预览 + 双环快门 + 左右快捷入口）负责拍照与两个抽屉，本餐草稿相纸承载
//      接触印相条、可改份量可删除的菜品行与合计，餐次/日期/时间与保存留在页面下方。
// 原理 识别、搜索、手写只是三种「往同一份草稿里加一条」的途径，入口本身失败只影响本次添加；
//      草稿 items 是独立状态，所以 PRD「识别超时或失败后已添加菜品仍保留」是状态结构保证，
//      不需要额外的回滚或恢复逻辑。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { PageProps } from '../App';
import type { Dish, MealItem, MealSlot, MealSummary } from '../domain/types';
import { MEAL_SLOT_LABEL } from '../domain/types';
import { computeCustomItem, computeItem, formatGrams, summarizeItems } from '../domain/nutrition';
import { localDate, localTime, defaultSlot, newId } from '../domain/stats';
import { recognizeDish, downscaleImage, type Candidate } from '../vision/recognize';
import { ApiError, apiErrorText } from '../vision/client';
import { searchDishes } from '../data/search';
import { allDishes, getDish } from '../data/dishes';
import { dishPhoto } from '../data/photos';
import { MacroRow, Notice, PendingTag } from '../components/ui';
import { useTicker } from '../components/useTicker';
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
    editing ? editing.items.map((it) => ({ ...it })) : [],
  );
  const [date, setDate] = useState(editing?.date ?? localDate());
  const [time, setTime] = useState(editing?.time ?? localTime());
  const [slot, setSlot] = useState<MealSlot>(editing?.slot ?? defaultSlot());

  const summary = useMemo(() => summarizeItems(items as MealItem[]), [items]);
  const tickedKcal = useTicker(summary.kcal);
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
      <nav className="nm-top">
        <button className="btn btn--ghost" onClick={() => navigate('today')}>
          ‹ 取消
        </button>
        <span className="nm-top__t">{isEditing ? '修改这一餐' : '新的一餐'}</span>
        <span className="nm-top__sp" aria-hidden="true" />
      </nav>

      <div className="nm-head">
        <h2>拍下这一餐</h2>
        <div className="nm-hint">
          对准餐盘按快门
          <br />
          也可搜索或手写
        </div>
      </div>

      <AddDish apiKey={settings.apiKey} hasKey={settings.hasKey} onPick={addItem} />

      <DraftPrint
        items={items}
        summary={summary}
        tickedKcal={tickedKcal}
        onChange={updateItem}
        onRemove={removeItem}
      />

      <section className="card section">
        <div className="field" style={{ marginTop: 0 }}>
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

/** 草稿相纸：胶片接触印相条 + 可改份量可删除的菜品行 + 这一餐合计。 */
function DraftPrint({
  items,
  summary,
  tickedKcal,
  onChange,
  onRemove,
}: {
  items: DraftItem[];
  summary: MealSummary;
  tickedKcal: number;
  onChange: (uid: string, patch: Partial<DraftItem>) => void;
  onRemove: (uid: string) => void;
}) {
  const ghosts = items.length > 0 ? Math.max(0, 5 - items.length) : 0;

  return (
    <div className="print draft">
      <div className="tape">本餐草稿</div>
      <div className="contact" aria-label="本餐已拍菜品">
        {items.length === 0 ? (
          <span className="contact__empty">拍到的菜会排成一列小相片</span>
        ) : (
          items.map((it) => {
            const photo = dishPhoto(it.dishId);
            // 待估算优先：存储里的旧记录可能 pending=true 却带着数值快照，不能只看有没有照片。
            if (it.pending || !photo) {
              return (
                <div key={it.uid} className="contact__cell contact__cell--todo">
                  <span>待估</span>
                </div>
              );
            }
            return (
              <div key={it.uid} className="contact__cell">
                <img src={photo} alt="" loading="lazy" />
              </div>
            );
          })
        )}
        {Array.from({ length: ghosts }, (_, i) => (
          <div key={`ghost-${i}`} className="contact__ghost" aria-hidden="true" />
        ))}
      </div>
      <div className="print__chin">
        <div className="dishlist">
          {items.length === 0 ? (
            <div className="draft-empty">还没有菜。按快门拍一张，或点两侧快捷补录。</div>
          ) : (
            items.map((it) => (
              <DraftItemRow
                key={it.uid}
                item={it}
                onChange={(patch) => onChange(it.uid, patch)}
                onRemove={() => onRemove(it.uid)}
              />
            ))
          )}
        </div>
        <div className="draft-sum">
          <div className="ds-l">
            {summary.pendingCount > 0 ? '已估算部分' : '这一餐合计'}
            <b>
              {items.length} 道菜
              {summary.pendingCount > 0
                ? `，含 ${summary.pendingCount} 道待估算（未计入上方数字）`
                : ''}
            </b>
          </div>
          <div className="ds-k" data-kcal={summary.kcal}>
            {summary.pendingCount > 0 && items.every((it) => it.pending) ? (
              <em style={{ font: '600 14px/1 var(--f-hand)', marginLeft: 0 }}>全部待估算</em>
            ) : (
              <>
                {summary.pendingCount > 0 ? '≈' : ''}
                {tickedKcal}
                <em>千卡</em>
              </>
            )}
          </div>
        </div>
        <MacroRow nutrition={summary} />
      </div>
    </div>
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

  const kcal = item.nutrition.kcal;
  // 待估算以 pending 为准：旧记录可能 pending=true 却保留数值快照。
  const todo = item.pending || kcal === null;

  return (
    <div>
      <div className={`dishrow${todo ? ' dishrow--todo' : ''}`}>
        <span className="dishrow__name">{item.name}</span>
        <span className="dishrow__qty">
          {item.portionLabel} <span className="num">{formatGrams(item.grams)}</span>g
        </span>
        <span className={`dishrow__kcal${todo ? ' todo-mark' : ''}`}>
          {todo ? (
            '待定'
          ) : (
            <>
              <span className="num">{Math.round(kcal ?? 0)}</span>
              <em>千卡</em>
            </>
          )}
        </span>
      </div>
      <div className="portions" style={{ paddingBottom: 'var(--s-3)' }}>
        {!custom && dish ? (
          <>
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
          </>
        ) : (
          <>
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
          </>
        )}
        <button className="btn btn--ghost btn--danger" aria-label={`删除 ${item.name}`} onClick={onRemove}>
          删除
        </button>
      </div>
    </div>
  );
}

/** 相机机身：取景器 + 双环快门 + 左右快捷入口，外加搜索抽屉、手写抽屉与两个选图 input。 */
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
  const [shotCap, setShotCap] = useState<ReactNode>(<>单道菜一张，识别后由你确认</>);
  const [firing, setFiring] = useState(false);
  const fireTimer = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // 预览图用 object URL：换图或卸载时立即释放，避免内存泄漏。
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (fireTimer.current !== null) window.clearTimeout(fireTimer.current);
    };
  }, []);

  function showPreview(file: File) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setPreview(url);
  }

  function clearPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreview(null);
  }

  function flashShutter() {
    setFiring(true);
    if (fireTimer.current !== null) window.clearTimeout(fireTimer.current);
    fireTimer.current = window.setTimeout(() => setFiring(false), 320);
  }

  /** 拍照入口：未配置 key 时给提示，不打开文件选择。 */
  function openCamera() {
    setError(null);
    if (!hasKey) {
      setError('未配置 API key。先在设置里填入才能拍照识别；也可以搜索或手动补录。');
      return;
    }
    if (recognizing) return;
    flashShutter();
    cameraRef.current?.click();
  }

  function openAlbum() {
    setError(null);
    if (!hasKey) {
      setError('未配置 API key。先在设置里填入才能拍照识别；也可以搜索或手动补录。');
      return;
    }
    if (recognizing) return;
    albumRef.current?.click();
  }

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
    showPreview(file);
    setRecognizing(true);
    try {
      const dataUrl = await downscaleImage(file);
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

  const [portionFor, setPortionFor] = useState<PickerState | null>(null);
  const [customGrams, setCustomGrams] = useState('');
  const [search, setSearch] = useState('');
  const results = useMemo(() => (search.trim() ? searchDishes(search, 10) : []), [search]);
  const common = useMemo(() => allDishes().slice(0, 8), []);

  function chooseCandidate(dish: Dish) {
    setPicking(null);
    clearPreview();
    setError(null);
    setShotCap(
      <>
        已选 <b>{dish.name}</b>，确认份量后加入
      </>,
    );
    // 选定菜品后进入份量选择
    setPortionFor({ dish, grams: standardGrams(dish), portionLabel: '标准份' });
  }

  function pickFromSearch(dish: Dish) {
    setError(null);
    setMode('idle');
    setSearch('');
    setShotCap(
      <>
        已选 <b>{dish.name}</b>，确认份量后加入
      </>,
    );
    setPortionFor({ dish, grams: standardGrams(dish), portionLabel: '标准份' });
  }

  return (
    <>
      {/* 拍与选分成两个 input：带 capture 的会强制开相机、不给相册入口，
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

      <div className="cam-body">
        <div className="cam-top">
          <span className="cam-lens-badge">
            <i className="cam-led" aria-hidden="true" />
            INSTANT 35
          </span>
          <span className="cam-stripe" aria-hidden="true">
            <i style={{ background: '#d65c3a' }} />
            <i style={{ background: '#e59d3c' }} />
            <i style={{ background: '#74aa66' }} />
          </span>
          <span className="cam-flash-win" aria-hidden="true" />
        </div>

        <div className="cam-vf">
          {preview && <img src={preview} alt="取景预览" />}
          <div className="cam-reticle" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="cam-cross" aria-hidden="true" />
          <span className="cam-vf-pill">{recognizing ? '对焦识别中…' : preview ? '已对焦餐盘' : '取景窗'}</span>
        </div>

        <div className="cam-controls">
          <button
            className="cam-side-btn"
            aria-expanded={mode === 'search'}
            onClick={() => setMode(mode === 'search' ? 'idle' : 'search')}
          >
            <SearchIcon />
            搜索添加
          </button>

          <button
            className={`shutter-btn${firing ? ' is-firing' : ''}`}
            aria-label="按下快门拍摄这一盘"
            aria-busy={recognizing}
            onClick={openCamera}
          >
            <span className="shutter-btn__cap" />
          </button>

          <button
            className="cam-side-btn"
            aria-expanded={mode === 'manual'}
            onClick={() => {
              const next = mode === 'manual' ? 'idle' : 'manual';
              setMode(next);
              if (next === 'manual') setError(null);
            }}
          >
            <PenIcon />
            手写补录
          </button>
        </div>
        <div className="shot-cap">{recognizing ? '正在识别，请稍候…' : shotCap}</div>
        <button
          className="btn btn--ghost"
          style={{ display: 'flex', width: '100%', marginTop: 4, fontSize: 'var(--t-xs)' }}
          onClick={openAlbum}
          disabled={recognizing}
        >
          从相册选一张
        </button>
      </div>

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
            <button
              className="btn btn--ghost"
              onClick={() => {
                setPicking(null);
                clearPreview();
              }}
            >
              都不是，重新拍
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => {
                setPicking(null);
                setMode('search');
              }}
            >
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
            <label className="field__label">或直接填克数（1~5000）</label>
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

      {mode === 'search' && (
        <div className="quick-drawer" aria-label="搜索添加菜品">
          <div className="qd-title">食堂常见菜品 · 选一道后确认份量</div>
          <div className="qd-grid">
            {common.map((d) => (
              <button
                key={d.id}
                className="qd-item"
                onClick={() => {
                  pickFromSearch(d);
                }}
              >
                {dishPhoto(d.id) ? (
                  <img src={dishPhoto(d.id) ?? ''} alt="" loading="lazy" />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{ width: 32, height: 32, flex: '0 0 auto', borderRadius: 3, background: 'var(--paper2)' }}
                  />
                )}
                <div>
                  <b>{d.name}</b>
                  <span>
                    {standardGrams(d)}g ·{' '}
                    {d.per100g.kcal === null
                      ? '待估算'
                      : `${Math.round((d.per100g.kcal * standardGrams(d)) / 100)}千卡`}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <input
            className="qd-input"
            style={{ marginTop: 'var(--s-2)', display: 'block', width: '100%' }}
            placeholder="输入菜名或别名，如「番茄炒蛋」「西红柿炒鸡蛋」"
            value={search}
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
                    pickFromSearch(d);
                    setSearch('');
                    setMode('idle');
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

      {mode === 'manual' && (
        <div className="quick-drawer" aria-label="手写补录">
          <div className="qd-title">手写补录（菜品库外标为待估算）</div>
          <ManualEntry
            onSubmit={(it) => {
              onPick(it);
              setMode('idle');
              setShotCap(
                <>
                  已手写 <b>{it.name}</b>（{formatGrams(it.grams)}g，标为待估算）
                </>,
              );
            }}
          />
        </div>
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/** 菜品库外的手动补录：只有菜名与克数，必然待估算。 */
function ManualEntry({ onSubmit }: { onSubmit: (item: Omit<MealItem, 'uid'>) => void }) {
  const [name, setName] = useState('');
  const [grams, setGrams] = useState('150');

  const valid = name.trim().length > 0 && parseGrams(grams) !== null;

  return (
    <form
      className="qd-form"
      onSubmit={(e) => {
        e.preventDefault();
        const g = parseGrams(grams);
        if (g !== null && name.trim()) onSubmit(computeCustomItem(name.trim(), g));
      }}
    >
      <input
        className="qd-input"
        type="text"
        placeholder="如：糖醋里脊"
        maxLength={16}
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="qd-input"
        style={{ flex: '0 0 74px' }}
        type="number"
        aria-label="克数"
        min={1}
        max={MAX_GRAMS}
        step="any"
        value={grams}
        onChange={(e) => setGrams(e.target.value)}
      />
      <button className="qd-submit" type="submit" disabled={!valid}>
        记上
      </button>
    </form>
  );
}

export { PendingTag };


