// S39O-cs-main: 应用入口，挂载 React 根并注册全局样式。
// 实现 创建 root，用错误边界包住 App；不做 StrictMode 之外的额外初始化。
// 原理 数据来自本机存储与导入文件，格式再严也可能有疏漏，顶层错误边界保证
// 任何渲染异常都变成可操作的兜底页，而不是白屏。
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/global.css';

const el = document.getElementById('root');
if (!el) throw new Error('找不到 #root 挂载点');
createRoot(el).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
