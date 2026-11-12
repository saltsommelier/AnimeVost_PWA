import { useEffect, useState } from 'react';
import { getLast } from './api/anime';
import { imageUrl } from './api/images';
import { rating10, titleName } from './api/parsers';
import type { Title } from './api/types';
import './App.css';

/**
 * Каркас оболочки (этап 1, PLAN §10): нижние табы + смоук-тест ленты.
 * Роутер и настоящие экраны — этапы 2–4; сейчас проверяем, что API,
 * картинки (новый хост) и тема работают в браузере.
 */

const TABS = ['Главная', 'Поиск', 'Расписание', 'Закладки', 'Профиль'] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Главная');
  const [titles, setTitles] = useState<Title[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== 'Главная') return;
    let cancelled = false;
    getLast(1)
      .then(({ data }) => {
        if (!cancelled) setTitles(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <div className="app">
      <main className="content">
        {tab === 'Главная' &&
          (error != null ? (
            <p className="error">{error}</p>
          ) : (
            <ul className="feed">
              {titles.map((t) => (
                <li key={t.id} className="card">
                  <img className="poster" src={imageUrl(t.urlImagePreview)} alt="" loading="lazy" />
                  <div className="cardBody">
                    <div className="cardTitle">{titleName(t.title)}</div>
                    <div className="cardMeta">
                      <span className="badge">{rating10(t).toFixed(2)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ))}
        {tab !== 'Главная' && <p className="stub">Экран «{tab}» — этап 2 (PLAN §10)</p>}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t}
            className={t === tab ? 'tab tabActive' : 'tab'}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
    </div>
  );
}
