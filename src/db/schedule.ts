import { getDb } from './index';

/**
 * Кэш расписания — порт нативного src/db/schedule.js: единственная строка
 * id=1, где json — массив из 7 дней [{ day, items: [{ id, title, time }] }],
 * updated_at — время записи. Расписание показываем сразу из кэша (работает
 * даже без сети), перезаписываем только когда контент изменился
 * (см. src/api/schedule.ts).
 */

import type { ScheduleDay } from '../api/schedule';

const CACHE_ID = 1;

export interface ScheduleCache {
  days: ScheduleDay[];
  updatedAt: number;
}

/** Кэшированное расписание или null, если пусто. */
export async function getCachedSchedule(): Promise<ScheduleCache | null> {
  const db = await getDb();
  const row = await db.get('schedule_cache', CACHE_ID);
  if (!row) return null;
  try {
    return { days: JSON.parse(row.json) as ScheduleDay[], updatedAt: row.updated_at };
  } catch {
    return null; // повреждённый JSON трактуем как отсутствие кэша
  }
}

/** Сохранить дни расписания (перезаписывает единственную строку кэша). */
export async function saveScheduleCache(days: ScheduleDay[]): Promise<void> {
  const db = await getDb();
  await db.put('schedule_cache', {
    id: CACHE_ID,
    json: JSON.stringify(days),
    updated_at: Date.now(),
  });
}
