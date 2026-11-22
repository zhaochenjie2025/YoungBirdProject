// S39O-cs-vite: Vite 构建配置，产物为纯静态文件用于 GitHub Pages。
// 实现 相对 base 路径 + React 插件 + 构建期剔除 sourcemap。
// 原理 GitHub Pages 项目站点部署在 /<repo>/ 子路径下，base 用相对路径可同时适配项目站点与自定义域名，无需改配置。
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: { host: '127.0.0.1', port: 5273 },
});
