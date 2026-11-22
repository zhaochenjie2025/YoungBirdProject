// S39O-cs-main: 应用入口，挂载 React 根并注册全局样式。
// 实现 创建 root、渲染 App；不做 StrictMode 双击保护之外的额外初始化。
// 原理 所有状态都在组件内从 localStorage 现读，入口保持无副作用，避免初始化顺序影响首屏。
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

const el = document.getElementById('root');
if (!el) throw new Error('找不到 #root 挂载点');
createRoot(el).render(<App />);
