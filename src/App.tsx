// S39O-cs-app: 顶层组件，装配路由、导航、记录状态与设置。
// 实现 按当前路由渲染页面，把 meals 与 settings 作为 props 下发；底部四栏导航。
// 原理 记录状态只在这里创建一次并向下传，页面组件保持无状态，
// 这样「改删后日/周统计一致」不依赖任何跨组件同步机制。
// 导航四栏对应定稿美术（今日 / 拍一张 / 本周 / 分享）。PRD 的「按日期查看历史」
// 由今日页的日期翻页承担，「修改 / 删除」挂在每日记录卡上；全部记录与导出导入
// 走 #/history，从今日页进入，不占导航格（见 docs/PRD-INQUIRY.md）。
import { useRoute } from './router';
import { useMeals } from './store/useMeals';
import { useSettings } from './store/useSettings';
import { TodayPage } from './pages/TodayPage';
import { NewMealPage } from './pages/NewMealPage';
import { MealDetailPage } from './pages/MealDetailPage';
import { WeekPage } from './pages/WeekPage';
import { HistoryPage } from './pages/HistoryPage';
import { SharePage } from './pages/SharePage';
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
  { to: 'today', label: '今日', match: ['today', 'meal', 'edit', 'history'] as const },
  { to: 'new', label: '拍一张', match: ['new'] as const },
  { to: 'week', label: '本周', match: ['week'] as const },
  { to: 'share', label: '分享', match: ['share'] as const },
];

export function App() {
  const { route, navigate } = useRoute();
  const meals = useMeals();
  const settings = useSettings();
  const props: PageProps = { meals, settings, navigate };

  const isActive = (match: readonly string[]) => match.includes(route.name);

  return (
    <div className="app">
      <div className="app-scroll">
        <main className="app__main" id="main">
          {meals.storageError && <div className="notice notice--error">{meals.storageError}</div>}
          {route.name === 'today' && <TodayPage {...props} />}
          {route.name === 'new' && <NewMealPage key="new" {...props} />}
          {route.name === 'edit' && <NewMealPage key={`edit-${route.id}`} {...props} editId={route.id} />}
          {route.name === 'meal' && <MealDetailPage {...props} id={route.id} />}
          {route.name === 'week' && <WeekPage {...props} />}
          {route.name === 'history' && <HistoryPage {...props} />}
          {route.name === 'share' && <SharePage {...props} />}
          {route.name === 'settings' && <SettingsPage {...props} />}
        </main>
      </div>

      <nav className="tabbar" role="tablist" aria-label="主导航">
        {NAV.map((n) => (
          <button
            key={n.to}
            className="tab"
            role="tab"
            aria-selected={isActive(n.match)}
            onClick={() => navigate(n.to)}
          >
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
