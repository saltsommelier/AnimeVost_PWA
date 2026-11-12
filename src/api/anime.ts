import { api } from './client';
import { PAGE_SIZE } from './config';
import type { Episode, GenresAndYears, Title } from './types';

/**
 * Эндпоинты API (PLAN §5). Все возвращают { data, count },
 * кроме getInfo — он разворачивает единственный элемент.
 * Порт нативного src/api/anime.js.
 */

/** Последние обновления, пагинация. ВАЖНО: `last` — GET, не POST. */
export const getLast = (page = 1, quantity = PAGE_SIZE) =>
  api.get<Title[]>('last', { page, quantity });

/** Поиск по названию (POST search, поле name). */
export const searchByName = (name: string) => api.post<Title[]>('search', { name });

/** Фильтр по жанру (POST search, поле gen). */
export const searchByGenre = (gen: string) => api.post<Title[]>('search', { gen });

/** Фильтр по году (POST search, поле year). */
export const searchByYear = (year: number) => api.post<Title[]>('search', { year });

/**
 * Жанры и годы. Числовые значения (строкой) — годы.
 * Референс дополнительно отбрасывает значение-заглушку 'Жанр'.
 */
export async function getGenres(): Promise<GenresAndYears> {
  const { data } = await api.get<unknown>('genres');
  const values = Array.isArray(data) ? data : Object.values(data ?? {});
  const filtered = values.filter((v): v is string | number => v != null && v !== 'Жанр');

  const years: number[] = [];
  const genres: string[] = [];
  for (const v of filtered) {
    if (!isNaN(Number(v))) years.push(parseInt(String(v), 10));
    else genres.push(String(v));
  }
  years.sort((a, b) => b - a);
  genres.sort((a, b) => a.localeCompare(b, 'ru'));
  return { years, genres };
}

/** Карточка тайтла с надёжным полем `timer`. */
export async function getInfo(id: number): Promise<Title> {
  const { data } = await api.post<Title | Title[]>('info', { id });
  return Array.isArray(data) ? data[0] : data;
}

/** Серии тайтла: поля name / hd / std / preview. */
export async function getPlaylist(id: number): Promise<Episode[]> {
  const { data } = await api.post<Episode[] | { data: Episode[] }>('playlist', { id });
  return Array.isArray(data) ? data : [];
}
