import { useCallback, useEffect, useState } from 'react';
import { getLast } from '../api/anime';
import { nextEpDate } from '../api/parsers';
import type { Title } from '../api/types';
import AnimeCard from '../components/AnimeCard';
import TopBar from '../components/TopBar';
import './screens.css';

/**
 * Главная — порт нативного src/screens/HomeScreen.js: «последние эпизоды»
 * из `last`, свежие сверху. Бесконечная лента: подгрузка при достижении
 * конца списка.
 */
export default function HomeScreen() {
  const [items, setItems] = useState<Title[]>([]);
  const [count, setCount] = useState<number | null>(null); // всего тайтлов по данным API
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, count: total } = await getLast(1);
      setItems(data ?? []);
      setCount(total);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || error) return;
    if (count != null && items.length >= count) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const { data } = await getLast(next);
      setItems((prev) => [...prev, ...(data ?? [])]);
      setPage(next);
    } catch {
      // тихо: пользователь потянет ещё раз
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, error, count, items.length, page]);

  return (
    <div className="screen">
      <TopBar title="Главная" />
      {loading ? (
        <div className="center">
          <Spinner />
        </div>
      ) : error ? (
        <div className="center">
          <div className="empty">{error}</div>
          <button type="button" className="retry" onClick={() => void load()}>
            Повторить
          </button>
        </div>
      ) : (
        <div className="feedList" onScroll={onFeedScroll(loadMore)}>
          {items.map((item) => {
            const nextEp = nextEpDate(item.timer);
            return (
              <AnimeCard
                key={item.id}
                item={item}
                meta={nextEp ? `Новая серия: ${nextEp}` : null}
              />
            );
          })}
          {loadingMore && (
            <div className="feedFooter">
              <Spinner small />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Бесконечная лента: подгрузка за 500px до конца списка. */
function onFeedScroll(loadMore: () => void) {
  let ticking = false;
  return (e: React.UIEvent<HTMLDivElement>) => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const el = e.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) loadMore();
    });
  };
}

/** Крутящийся индикатор — DOM-замена ActivityIndicator. */
export function Spinner({ small = false }: { small?: boolean }) {
  return <div className={small ? 'spinner small' : 'spinner'} />;
}
