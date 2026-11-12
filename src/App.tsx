import { useEffect, useState } from 'react';
import { IoBookmarks, IoBookmarksOutline, IoCalendar, IoCalendarOutline, IoHome, IoHomeOutline, IoPerson, IoPersonOutline } from 'react-icons/io5';
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import BookmarksScreen from './screens/BookmarksScreen';
import HomeScreen from './screens/HomeScreen';
import ProfileScreen from './screens/ProfileScreen';
import ScheduleScreen from './screens/ScheduleScreen';
import SearchScreen from './screens/SearchScreen';
import SettingsScreen from './screens/SettingsScreen';
import ScreenHeader from './components/ScreenHeader';
import { refreshSchedule } from './api/schedule';
import { getDb } from './db';
import './App.css';

/**
 * Точка входа — порт нативного App.js + src/navigation/index.js.
 * Сначала инициализируем БД (миграции + сид списков), затем показываем
 * навигацию. Расписание обновляем один раз за запуск (PLAN §6.2): ошибки
 * сети тихо игнорируем — остаёмся на кэше.
 *
 * Навигация (как в нативном): нижние вкладки Главная/Закладки/Расписание/
 * Профиль; поверх — over-экраны (поиск, тайтл, настройки) БЕЗ таб-бара.
 */
export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getDb()
      .then(() => mounted && setReady(true))
      .catch((e: Error) => mounted && setError(e.message));
    void refreshSchedule().catch(() => {
      // тихо: остаёмся на кэше расписания (native App.js)
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="bootCenter">
        <div className="bootError">Ошибка базы данных: {error}</div>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="bootCenter">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* вкладки — с таб-баром */}
        <Route element={<TabLayout />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/bookmarks" element={<BookmarksScreen />} />
          <Route path="/schedule" element={<ScheduleScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
        </Route>

        {/* over-экраны — во весь экран, без таб-бара (как native stack) */}
        <Route path="/search" element={<SearchScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/title/:id" element={<TitleStub />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

const TABS = [
  { path: '/', label: 'Главная', icon: IoHome, iconOutline: IoHomeOutline },
  { path: '/bookmarks', label: 'Закладки', icon: IoBookmarks, iconOutline: IoBookmarksOutline },
  { path: '/schedule', label: 'Расписание', icon: IoCalendar, iconOutline: IoCalendarOutline },
  { path: '/profile', label: 'Профиль', icon: IoPerson, iconOutline: IoPersonOutline },
];

/** Оболочка вкладок: контент + нижний таб-бар (native Tabs). */
function TabLayout() {
  return (
    <div className="app">
      <main className="content">
        <Outlet />
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink
            key={t.path}
            to={t.path}
            end={t.path === '/'}
            className={({ isActive }) => (isActive ? 'tab tabActive' : 'tab')}
          >
            {({ isActive }) => (
              <>
                {isActive ? <t.icon size={24} /> : <t.iconOutline size={24} />}
                <span>{t.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Экран тайтла — этап 3 (PLAN §10). Пока заглушка. */
function TitleStub() {
  return (
    <div className="app">
      <ScreenHeader title="Аниме" />
      <div className="center">
        <div className="empty">Экран тайтла — этап 3 (PLAN §10)</div>
      </div>
    </div>
  );
}
