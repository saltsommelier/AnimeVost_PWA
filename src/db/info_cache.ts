import { getDb } from './index';
import type { Title } from '../api/types';

/**
 * Кэш объектов getInfo по id аниме — порт нативного src/db/info_cache.js:
 * карточки расписания строятся из этих данных (постер, описание, рейтинг),
 * чтобы не дёргать getInfo заново при каждом открытии дня. updated_at —
 * на будущее (TTL/инвалидация).
 */

/** Пакетно: Map anime_id → объект info (только те, что есть в кэше). */
export async function getInfoCacheMany(ids: number[]): Promise<Map<number, Title>> {
  const map = new Map<number, Title>();
  if (!ids.length) return map;
  const db = await getDb();
  for (const id of ids) {
    const row = await db.get('info_cache', id);
    if (!row) continue;
    try {
      map.set(id, JSON.parse(row.json) as Title);
    } catch {
      // повреждённая строка — игнорируем, перезапишется при обновлении
    }
  }
  return map;
}

/** Сохранить/обновить объект info по id. */
export async function saveInfoCache(animeId: number, info: Title): Promise<void> {
  const db = await getDb();
  await db.put('info_cache', {
    anime_id: animeId,
    json: JSON.stringify(info),
    updated_at: Date.now(),
  });
}
