import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInfo } from '../api/anime';
import { getScheduleError, subscribeSchedule } from '../api/schedule';
import type { Title } from '../api/types';
import AnimeCard from '../components/AnimeCard';
import TopBar from '../components/TopBar';
import * as infoCache from '../db/info_cache';
import { getCachedSchedule, type ScheduleCache } from '../db/schedule';
import './screens.css';

/**
 * Расписание — порт нативного src/screens/ScheduleScreen.js: реальные
 * данные из HTML главной animevost.org. Кэш (IndexedDB) показываем сразу —
 * работает даже без сети; обновление кэша происходит один раз при запуске
 * приложения (App.tsx → refreshSchedule), экран подписан на изменения.
 *
 * Карточки — те же AnimeCard, что на главной: постер/описание/рейтинг
 * берём из getInfo по каждому тайтлу (кэш info_cache — второй раз запросов
 * нет), в строке рейтинга справа — время выхода этого дня. Пока карточка
 * не догрузилась, показываем простой ряд «название + время».
 */
const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Индекс сегодняшнего дня в формате Пн=0…Вс=6. */
function todayIndex(): number {
  return (new Date().getDay() + 6) % 7;
}

export default function ScheduleScreen() {
  const navigate = useNavigate();
  const [data, setData] = useState<ScheduleCache | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [selected, setSelected] = useState(todayIndex());
  const [details, setDetails] = useState<Map<number, Title>>(new Map()); // anime_id → getInfo

  useEffect(() => {
    let mounted = true;
    const load = () => {
      void getCachedSchedule().then((d) => {
        if (mounted) setData(d);
      });
      setRefreshError(getScheduleError());
    };
    load();
    const unsubscribe = subscribeSchedule(load);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const today = todayIndex();
  const day = data?.days?.[selected];
  const items = day?.items ?? [];

  // Полные карточки выбранного дня: сначала кэш, чего нет — параллельные
  // getInfo (постер/описание/рейтинг); ответы складываем в info_cache.
  useEffect(() => {
    if (!day || items.length === 0) return undefined;
    let cancelled = false;
    void (async () => {
      const ids = items.map((it) => it.id);
      const cached = await infoCache.getInfoCacheMany(ids);
      if (cancelled) return;
      if (cached.size) setDetails((prev) => new Map([...prev, ...cached]));
      const missing = ids.filter((id) => !cached.has(id));
      const results = await Promise.allSettled(missing.map((id) => getInfo(id)));
      const fresh = new Map<number, Title>();
      for (let i = 0; i < missing.length; i++) {
        const res = results[i];
        if (res.status === 'fulfilled' && res.value) {
          fresh.set(missing[i], res.value);
          void infoCache.saveInfoCache(missing[i], res.value).catch(() => {});
        }
      }
      if (!cancelled && fresh.size) setDetails((prev) => new Map([...prev, ...fresh]));
    })();
    return () => {
      cancelled = true;
    };
    // items — производный массив: данные дня меняются только с data/selected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selected]);

  return (
    <div className="screen">
      <TopBar title="Расписание" />

      <div className="chipsScroll">
        <div className="chips">
          {DAYS_SHORT.map((label, i) => (
            <button
              type="button"
              key={label}
              className={[
                'chip',
                i === selected ? 'chipActive' : '',
                i === today && i !== selected ? 'chipToday' : '',
              ].join(' ')}
              onClick={() => setSelected(i)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="center">
          <div className="empty">
            {refreshError
              ? `Не удалось загрузить расписание: ${refreshError}. Покажем кэш при следующем успешном обновлении.`
              : 'Загружаем расписание…'}
          </div>
        </div>
      ) : (
        <div className="feedList">
          <div className="dayTitle">
            {day?.day}
            {selected === today ? ' — сегодня' : ''}
          </div>
          <div className="caption">только озвучка animevost · время московское</div>
          {items.length === 0 && <div className="empty emptyPadded">В этот день озвучек нет</div>}
          {items.map((item) => {
            const info = details.get(item.id);
            return info ? (
              <AnimeCard key={item.id} item={info} meta={item.time} />
            ) : (
              // пока карточка не догрузилась — простой ряд «название + время»
              <button
                type="button"
                key={item.id}
                className="scheduleRow"
                onClick={() => navigate(`/title/${item.id}`)}
              >
                <span className="scheduleRowTitle">{item.title}</span>
                <span className="scheduleRowTime">{item.time}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
