// S39O-cs-errorboundary: 顶层错误边界，任何渲染异常都不至于白屏。
// 实现 捕获子树渲染错误，展示可操作的兜底页：重载、导出数据、清除本机数据。
// 原理 记录数据来自本机存储与导入文件，格式再严也可能有疏漏；没有兜底时
// 一个渲染异常会让页面全白，用户连导出备份和清数据的入口都点不到。
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { exportMeals, saveMeals, loadMeals, clearAll } from '../store/persistence';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[boundary] 渲染异常', error, info.componentStack);
  }

  private download(): void {
    try {
      const text = exportMeals(loadMeals());
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `caloriesnap-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[boundary] 导出失败', e);
    }
  }

  private clear(): void {
    clearAll();
    // 用 saveMeals([]) 而非仅 removeItem，确保键存在且格式明确，避免再次读到损坏数据。
    try {
      saveMeals([]);
    } catch (e) {
      console.error('[boundary] 清空后写回失败', e);
    }
    window.location.hash = '#/today';
    window.location.reload();
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app">
        <main className="app__main">
          <header className="app__header">
            <h1 className="app__title">页面出错了</h1>
          </header>
          <div className="card">
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>
              应用在渲染记录时遇到问题，通常是本机保存的数据格式不对（例如导入了一份不完整的备份）。
              你可以先导出备份再清空，或者直接重新加载试试。
            </p>
            <pre
              style={{
                fontSize: 12,
                color: 'var(--ink-3)',
                overflowX: 'auto',
                background: 'var(--surface-2)',
                padding: 'var(--s-3)',
                borderRadius: 'var(--r-sm)',
                marginTop: 'var(--s-3)',
              }}
            >
              {this.state.error.message}
            </pre>
            <div className="actions">
              <button className="btn" onClick={() => window.location.reload()}>
                重新加载
              </button>
              <button className="btn" onClick={() => this.download()}>
                导出备份
              </button>
              <button className="btn btn--danger" onClick={() => this.clear()}>
                清除本机数据
              </button>
            </div>
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 'var(--s-3)' }}>
              清除本机数据会删除这台浏览器里的全部饮食记录，且无法恢复。
            </p>
          </div>
        </main>
      </div>
    );
  }
}
