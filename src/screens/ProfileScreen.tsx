import { useCallback, useEffect, useState } from 'react';
import TopBar from '../components/TopBar';
import type { ListRow } from '../db/index';
import * as historyDb from '../db/history';
import * as listsDb from '../db/lists';
import './screens.css';

/**
 * Профиль — порт нативного src/screens/ProfileScreen.js: статистика из
 * Истории + кол-во аниме в каждом списке.
 * Отличие от нативного: там выводились сырые id списков (заглушка),
 * здесь — имена списков (беру из lists); зафиксировано в PLAN §13.
 */
export default function ProfileScreen() {
  const [stats, setStats] = useState({ episodes: 0, anime: 0 });
  const [lists, setLists] = useState<ListRow[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});

  const reload = useCallback(() => {
    let cancelled = false;
    void (async () => {
      const [historyStats, allLists, listCounts] = await Promise.all([
        historyDb.getStats(),
        listsDb.getLists(),
        listsDb.getListItemCounts(),
      ]);
      if (cancelled) return;
      const map: Record<number, number> = {};
      for (const row of listCounts) map[row.list_id] = row.count;
      setStats(historyStats);
      setLists(allLists);
      setCounts(map);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(reload, [reload]);

  return (
    <div className="screen">
      <TopBar title="Профиль" />
      <div className="profileContent">
        <div className="rowPair">
          <div className="statBox">
            <div className="statValue">{stats.episodes}</div>
            <div className="statLabel">серий просмотрено</div>
          </div>
          <div className="statBox">
            <div className="statValue">{stats.anime}</div>
            <div className="statLabel">аниме начато</div>
          </div>
        </div>

        <div className="profileSection">По спискам</div>
        <div className="listBox">
          {lists.length === 0 && (
            <div className="profileListEmpty">Пока пусто — добавляй аниме в списки долгим тапом</div>
          )}
          {lists.map((list) => (
            <div key={String(list.id)} className="profileListRow">
              <span>{list.name}</span>
              <span className="profileListCount">{counts[list.id] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
