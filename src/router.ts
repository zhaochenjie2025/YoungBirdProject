// S39O-cs-router: 极简 hash 路由，八个页面，不引第三方路由库。
// 实现 解析 location.hash 为 {name, params}，监听 hashchange 重渲染，提供 navigate。
// 原理 GitHub Pages 无服务端重写，hash 路由不需要 404 回退配置；
// 页面只有七个、层级极浅，路由库的体积换不回任何能力。
import { useEffect, useState, useCallback } from 'react';

export type Route =
  | { name: 'today' }
  | { name: 'new' }
  | { name: 'edit'; id: string }
  | { name: 'meal'; id: string }
  | { name: 'week' }
  | { name: 'share' }
  | { name: 'history' }
  | { name: 'settings' };

function parse(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const [head = '', ...rest] = clean.split('/');
  switch (head) {
    case '':
    case 'today':
      return { name: 'today' };
    case 'new':
      return { name: 'new' };
    case 'edit':
      return rest[0] ? { name: 'edit', id: rest[0] } : { name: 'new' };
    case 'meal':
      return rest[0] ? { name: 'meal', id: rest[0] } : { name: 'today' };
    case 'share':
      return { name: 'share' };
    case 'week':
      return { name: 'week' };
    case 'history':
      // 全部记录页：按日期倒序浏览，并提供导出导入入口。
      return { name: 'history' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'today' };
  }
}

export function useRoute(): { route: Route; navigate: (to: string) => void } {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((to: string) => {
    const target = to.startsWith('#') ? to : `#/${to.replace(/^\//, '')}`;
    if (window.location.hash === target) {
      setRoute(parse(target));
    } else {
      window.location.hash = target;
    }
    window.scrollTo({ top: 0 });
  }, []);

  return { route, navigate };
}

export function mealHref(id: string): string {
  return `#/meal/${id}`;
}
export function editHref(id: string): string {
  return `#/edit/${id}`;
}
