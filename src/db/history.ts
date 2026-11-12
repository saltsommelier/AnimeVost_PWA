import { getDb, type HistoryRow } from './index';

/**
 * Сервис Истории — автозаполняется плеером (порт нативного src/db/history.js).
 * Статистика Профиля считается из Истории, НЕ из списков.
 */

/** Аргументы записи просмотра. */
export interface UpsertHistoryArgs {
  animeId: number;
  title: string;
  preview?: string | null;
  description?: string | null;
  rating?: number | null;
  votes?: number | null;
  episodeName?: string | null;
  episodeNumber?: number | null;
  positionSec?: number;
  durationSec?: number;
}

/** Записать/обновить просмотр. positionSec/durationSec — прогресс серии. */
export async function upsertHistory(args: UpsertHistoryArgs): Promise<void> {
  const db = await getDb();
  const positionSec = args.positionSec ?? 0;
  const durationSec = args.durationSec ?? 0;
  const pct =
    durationSec > 0 ? Math.min(100, Math.round((positionSec / durationSec) * 100)) : 0;

  const prev = await db.get('history', args.animeId);
  // COALESCE-семантика нативного: старые непустые description/rating/votes
  // не перетираются пустыми из новой записи
  const row: HistoryRow = {
    anime_id: args.animeId,
    title: args.title,
    preview: args.preview ?? null,
    description: args.description ?? prev?.description ?? null,
    rating: args.rating ?? prev?.rating ?? null,
    votes: args.votes ?? prev?.votes ?? null,
    episode_name: args.episodeName ?? null,
    episode_number: args.episodeNumber ?? null,
    position_sec: positionSec,
    duration_sec: durationSec,
    watched_pct: pct,
    updated_at: Date.now(),
  };
  await db.put('history', row);
}

/** Лента Истории (для вкладки Закладки), свежие сверху. */
export async function getHistory({ limit = 100, offset = 0 } = {}): Promise<HistoryRow[]> {
  const db = await getDb();
  const rows = await db.getAll('history');
  rows.sort((a, b) => b.updated_at - a.updated_at);
  return rows.slice(offset, offset + limit);
}

/** Запись истории по тайтлу — «досмотрено N%» в карточке. */
export async function getHistoryItem(animeId: number): Promise<HistoryRow | undefined> {
  const db = await getDb();
  return db.get('history', animeId);
}

/** Статистика для Профиля: просмотрено серий и аниме (PLAN §5.4). */
export async function getStats(): Promise<{ episodes: number; anime: number }> {
  const db = await getDb();
  const rows = await db.getAll('history');
  const animeIds = new Set(rows.map((r) => r.anime_id));
  return { episodes: rows.length, anime: animeIds.size };
}
