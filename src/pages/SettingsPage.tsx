// S39O-cs-page-settings: 设置页，配置 DeepSeek API key 与存储方式，并说明数据边界。
// 实现 key 输入、记住开关、清除；不做联网校验，避免为了"验证 key"多发一次付费请求。
// 原理 明白告知用户 key 存在哪、会发往哪个域名、不配时哪些功能不可用，
// 让用户自己承担取舍，而不是把风险藏在文案里。
import { useState } from 'react';
import type { PageProps } from '../App';
import { Notice } from '../components/ui';
import { MODEL } from '../vision/client';

export function SettingsPage({ settings, meals }: PageProps) {
  const [draft, setDraft] = useState(settings.apiKey);
  const [persist, setPersist] = useState(settings.persist);
  const [saved, setSaved] = useState(false);

  return (
    <>
      <header className="app__header">
        <div>
          <h1 className="app__title">设置</h1>
          <div className="app__sub">识别与建议需要你自己的 DeepSeek API key</div>
        </div>
      </header>

      <section className="card">
        <div className="section__title" style={{ marginBottom: 'var(--s-2)' }}>
          API key
        </div>
        <div className="field">
          <label className="field__label" htmlFor="apikey">
            DeepSeek API key
          </label>
          <input
            id="apikey"
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-..."
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSaved(false);
            }}
          />
        </div>
        <label
          style={{
            display: 'flex',
            gap: 'var(--s-2)',
            alignItems: 'center',
            marginTop: 'var(--s-3)',
            fontSize: 'var(--t-sm)',
          }}
        >
          <input
            type="checkbox"
            checked={persist}
            onChange={(e) => {
              setPersist(e.target.checked);
              setSaved(false);
            }}
          />
          记住这把 key（不勾选则只在当前标签页有效，关掉就失效）
        </label>
        <div className="actions">
          <button
            className="btn btn--primary"
            onClick={() => {
              settings.setApiKey(draft, persist);
              setSaved(true);
            }}
          >
            保存
          </button>
          <button
            className="btn btn--danger"
            onClick={() => {
              settings.clearKey();
              setDraft('');
              setSaved(false);
            }}
          >
            清除
          </button>
        </div>
        {saved && <Notice kind="info">已保存。当前状态：{settings.hasKey ? '已配置' : '未配置'}。</Notice>}
        {!saved && (
          <div style={{ marginTop: 'var(--s-2)', fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>
            当前状态：{settings.hasKey ? (settings.persist ? '已配置（长期保存）' : '已配置（仅本标签页）') : '未配置'}
          </div>
        )}
      </section>

      <section className="card section">
        <div className="section__title" style={{ marginBottom: 'var(--s-2)' }}>
          这把 key 会被怎么用
        </div>
        <ul style={{ margin: 0, paddingLeft: '1.2em', fontSize: 'var(--t-sm)', lineHeight: 1.8 }}>
          <li>
            请求直接发往 <code>api.deepseek.com</code>，模型 <code>{MODEL}</code>。
          </li>
          <li>key 只存在你自己的浏览器里，不会经过任何中间服务器，也不会写入网址或日志。</li>
          <li>识别时会上传你拍的照片；建议时只上传菜名与已算好的营养数值，不上传照片。</li>
          <li>页面没有任何第三方脚本（无统计、无广告、无外部字体），减少 key 外泄的可能。</li>
          <li>建议单独申请一把额度较低的 key 用于此应用，不要复用重要账号的 key。</li>
        </ul>
      </section>

      <section className="card section">
        <div className="section__title" style={{ marginBottom: 'var(--s-2)' }}>
          数据
        </div>
        <div style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.8 }}>
          当前有 <span className="num">{meals.meals.length}</span> 条记录，全部保存在这台设备的浏览器里，
          不上传、不同步。清理浏览器数据会丢失，换设备请到「历史」页导出 JSON 再导入。
        </div>
      </section>
    </>
  );
}
