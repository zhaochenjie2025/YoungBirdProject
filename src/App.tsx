// S39O-cs-app: 顶层组件，装配路由、导航、记录状态与设置。
// 实现 按当前路由渲染页面，把 meals 与 settings 作为 props 下发；底部四栏导航。
// 原理 记录状态只在这里创建一次并向下传，页面组件保持无状态，
// 这样「改删后日/周统计一致」不依赖任何跨组件同步机制。
import { useRoute } from './router';
import { useMeals } from './store/useMeals';
import { useSettings } from './store/useSettings';
import { TodayPage } from './pages/TodayPage';
import { NewMealPage } from './pages/NewMealPage';
import { MealDetailPage } from './pages/MealDetailPage';
import { HistoryPage } from './pages/HistoryPage';
import { WeekPage } from './pages/WeekPage';
import { SettingsPage } from './pages/SettingsPage';
import type { MealsApi } from './store/useMeals';
import type { SettingsApi } from './store/useSettings';
import './styles/app.css';

export interface PageProps {
  meals: MealsApi;
  settings: SettingsApi;
  navigate: (to: string) => void;
}

const NAV = [
  { to: 'today', label: '今日', icon: '◎', match: ['today', 'meal'] as const },
  { to: 'new', label: '记录', icon: '＋', match: ['new', 'edit'] as const },
  { to: 'week', label: '本周', icon: '▤', match: ['week'] as const },
  { to: 'history', label: '历史', icon: '≡', match: ['history'] as const },
];

export function App() {
  const { route, navigate } = useRoute();
  const meals = useMeals();
  const settings = useSettings();
  const props: PageProps = { meals, settings, navigate };

  const isActive = (match: readonly string[]) => match.includes(route.name);

  return (
    <div className="app">
      <main className="app__main">
        {meals.storageError && <div className="notice notice--error">{meals.storageError}</div>}
        {route.name === 'today' && <TodayPage {...props} />}
        {route.name === 'new' && <NewMealPage key="new" {...props} />}
        {route.name === 'edit' && <NewMealPage key={`edit-${route.id}`} {...props} editId={route.id} />}
        {route.name === 'meal' && <MealDetailPage {...props} id={route.id} />}
        {route.name === 'history' && <HistoryPage {...props} />}
        {route.name === 'week' && <WeekPage {...props} />}
        {route.name === 'settings' && <SettingsPage {...props} />}
      </main>

      <nav className="nav" aria-label="主导航">
        {NAV.map((n) => (
          <button
            key={n.to}
            className="nav__item"
            aria-current={isActive(n.match) ? 'page' : undefined}
            onClick={() => navigate(n.to)}
          >
            <span className="nav__icon" aria-hidden="true">
              {n.icon}
            </span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
