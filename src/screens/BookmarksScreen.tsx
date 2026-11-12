import { useCallback, useEffect, useRef, useState } from 'react';
import type { Title } from '../api/types';
import AnimeCard from '../components/AnimeCard';
import TopBar from '../components/TopBar';
import type { ListRow } from '../db/index';
import * as historyDb from '../db/history';
import * as listsDb from '../db/lists';
import { Spinner } from './HomeScreen';
import './screens.css';

/**
 * Закладки — порт нативного src/screens/BookmarksScreen.js: под верх-баром —
 * горизонтально скроллящиеся чипы списков (скрытые не показываем),
 * содержимое листается свайпом влево/вправо между списками.
 * В Истории карточки с полоской прогресса.
 */
export default function BookmarksScreen() {
  const [lists, setLists] = useState<ListRow[]>([]);
  const [itemsMap, setItemsMap] = useState<Record<number, Title[]>>({});
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const pagerRef = useRef<HTMLDivElement>(null);

  // перезагрузка при каждом показе вкладки — веб-эквивалент useFocusEffect
  const reload = useCallback(() => {
    let cancelled = false;
    void (async () => {
      try {
        const visible = await listsDb.getLists({ includeHidden: false });
        const map: Record<number, Title[]> = {};
        for (const list of visible) {
          if (list.key === 'history') {
            // История — из таблицы истории, с прогрессом «досмотрено N%»
            const rows = await historyDb.getHistory({ limit: 200 });
            map[list.id] = rows.map((r) => ({
              id: r.anime_id,
              title: r.title,
              urlImagePreview: r.preview,
              description: r.description,
              rating: r.rating,
              votes: r.votes,
              progress: r.duration_sec > 0 ? r.watched_pct / 100 : null,
            }));
          } else {
            const rows = await listsDb.getListItems(list.id);
            map[list.id] = rows.map((r) => ({
              id: r.anime_id,
              title: r.title,
              urlImagePreview: r.preview,
              description: r.description,
              rating: r.rating,
              votes: r.votes,
            }));
          }
        }
        if (!cancelled) {
          setLists(visible);
          setItemsMap(map);
          setSelected((idx) => Math.max(0, Math.min(idx, visible.length - 1)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(reload, [reload]);

  function emptyText(list: ListRow): string {
    if (list.key === 'history') return 'История заполнится после просмотра серий';
    if (list.key === 'favorites') return 'Пусто — добавляйте аниме долгим тапом по карточке';
    return 'Список пуст — добавляйте аниме долгим тапом по карточке';
  }

  /** Чип → проскроллить пейджер к странице списка. */
  function scrollToPage(idx: number) {
    const pager = pagerRef.current;
    if (!pager) return;
    pager.scrollTo({ left: idx * pager.clientWidth, behavior: 'smooth' });
  }

  /** Свайп пейджера → подсветить соответствующий чип. */
  function onPagerScroll(e: React.UIEvent<HTMLDivElement>) {
    const pager = e.currentTarget;
    const idx = Math.round(pager.scrollLeft / pager.clientWidth);
    if (idx !== selected && idx >= 0 && idx < lists.length) setSelected(idx);
  }

  return (
    <div className="screen">
      <TopBar title="Закладки" />

      {loading ? (
        <div className="center">
          <Spinner />
        </div>
      ) : lists.length === 0 ? (
        <div className="center">
          <div className="empty">Все списки скрыты — включите их в настройках</div>
        </div>
      ) : (
        <>
          <div className="chipsScroll">
            <div className="chips">
              {lists.map((list, idx) => {
                const count = itemsMap[list.id]?.length;
                return (
                  <button
                    type="button"
                    key={String(list.id)}
                    className={`chip ${idx === selected ? 'chipActive' : ''}`}
                    onClick={() => scrollToPage(idx)}
                  >
                    {list.name}
                    {count ? ` · ${count}` : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* пейджер: свайп между списками (scroll-snap) */}
          <div className="pager" ref={pagerRef} onScroll={onPagerScroll}>
            {lists.map((list) => {
              const items = itemsMap[list.id] ?? [];
              return (
                <div className="pagerPage" key={String(list.id)}>
                  {items.length === 0 ? (
                    <div className="center">
                      <div className="empty">{emptyText(list)}</div>
                    </div>
                  ) : (
                    <div className="feedList">
                      {items.map((item) => (
                        <AnimeCard key={String(item.id)} item={item} progress={item.progress ?? null} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
