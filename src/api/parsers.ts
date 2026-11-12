/**
 * Парсеры полей API — порт нативного src/api/parsers.js (PLAN §5).
 * Реальный формат поля title: 'Русское название / Original [16 из 25]'
 * (скобки содержат счётчик эпизодов, не год).
 */

/** Русское название — всё до ' /'. */
export function titleName(title: string | null | undefined): string {
  return String(title ?? '')
    .split(' /')[0]
    .trim();
}

/** Оригинальное название — между ' /' и ' ['. */
export function titleOriginalName(title: string | null | undefined): string {
  const parts = String(title ?? '').split(' /');
  return (parts[1] ?? '')
    .split(' [')[0]
    .trim();
}

/**
 * Счётчик эпизодов — содержимое ПЕРВОЙ пары [..] после ' /'.
 * В реальных тайтлах бывают доп. скобки '[7 серия - 16 ноября]' —
 * берём только счётчик.
 */
export function seriesFromTitle(title: string | null | undefined): string {
  const parts = String(title ?? '').split(' /');
  const m = (parts[1] ?? '').match(/\[([^\]]+)\]/);
  return m ? m[1] : '';
}

function episodeNumber(name: string): number {
  const m = String(name ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

/** Сортировка серий по номеру из названия (resort референса). */
export function resort<T extends { name: string }>(episodes: T[]): T[] {
  return [...episodes].sort((a, b) => episodeNumber(a.name) - episodeNumber(b.name));
}

/** Рейтинг по шкале 0–10 (референс: rating / votes * 2, два знака). */
export function rating10(item: { rating?: number | null; votes?: number | null }): number {
  if (!item?.votes) return 0;
  return (Math.round((item.rating! / item.votes) * 100) / 100) * 2;
}

/** Метка «Анонс» — вторая часть title содержит '[Анонс]' (как в референсе). */
export function isAnnouncement(title: string | null | undefined): boolean {
  const parts = String(title ?? '').split('/');
  return Boolean(parts[1] && parts[1].includes('[Анонс]'));
}

/**
 * Дата следующей серии по полю timer (unix-секунды) — ТОЛЬКО дата без
 * времени; в расписании наоборот — время. timer = 0 или прошедшая дата → null.
 */
export function nextEpDate(timer: number | null | undefined): string | null {
  if (!timer || timer * 1000 < Date.now()) return null;
  return new Date(timer * 1000).toLocaleDateString('ru-RU');
}
