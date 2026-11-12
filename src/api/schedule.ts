import { getCachedSchedule, saveScheduleCache } from '../db/schedule';

/**
 * Расписание сайта (PLAN §6.2 нативного): оно есть ТОЛЬКО в HTML главной
 * страницы (блок div#raspisMon…#raspisSun со ссылками вида
 * `<a href="/tip/tv/4026-slug.html">Название ~ (17:30)</a>`).
 *
 * ПРОВЕРЕНО 12.11.2026 (PWA §4): главная animevost.org НЕ отдаёт
 * Access-Control-Allow-Origin — браузер не может прочитать HTML напрямую
 * (в нативном приложении ограничений нет). Поэтому — цепочка попыток:
 *   1) прямая (вдруг сайт откроет CORS — тогда заработает без посредников);
 *   2) публичные CORS-прокси (allorigins, codetabs); 12.11.2026 оба лежали
 *      (522) — живые прокси подхватятся автоматически, список правится здесь.
 *
 * Стратегия — как в нативном: грузим главную ОДИН раз при запуске приложения;
 * кэш в IndexedDB показываем сразу — расписание видно даже без сети; кэш
 * перезаписываем только когда HTML реально изменился. Ошибки сети не ломают
 * запуск — тихо остаёмся на кэше.
 *
 * ВЕСЬ способ доставки расписания правится ТОЛЬКО здесь.
 */

const SITE_URL = 'https://animevost.org/';
const TIMEOUT_MS = 15000;

/** CORS-прокси — URL-функции, пробуем по порядку. */
const PROXY_BUILDERS: ((url: string) => string)[] = [
  (url) => url, // 1. прямая попытка (сайт пока без CORS — упадёт по таймауту/CORS)
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, // 2. allorigins
  (url) => `https://api.codetabs.com/v1/proxy?quest=${url}`, // 3. codetabs
];

// id блоков дней в порядке Пн…Вс
const DAY_IDS = [
  'raspisMon',
  'raspisTue',
  'raspisWed',
  'raspisThu',
  'raspisFri',
  'raspisSat',
  'raspisSun',
];
const DAY_NAMES = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
];

export interface ScheduleItem {
  id: number;
  title: string;
  time: string;
}

export interface ScheduleDay {
  day: string;
  items: ScheduleItem[];
}

/**
 * Парсинг расписания из HTML главной — регулярки идентичны нативному.
 * Внутри div.raspis* только ссылки — HTML-парсер не нужен.
 */
export function parseSchedule(html: string): ScheduleDay[] {
  return DAY_IDS.map((dayId, i) => {
    const blockMatch = html.match(
      new RegExp(`<div id="${dayId}"[^>]*>([\\s\\S]*?)</div>`, 'i'),
    );
    const block = blockMatch ? blockMatch[1] : '';
    const items: ScheduleItem[] = [];
    const linkRe = /<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(block))) {
      // href = "/tip/tv/4026-slug.html" → id аниме = число перед дефисом
      const idMatch = m[1].match(/\/(\d+)-/);
      // текст = «Название ~ (17:30)» или «Название ~ (В течение дня)»
      const textMatch = m[2].match(/^(.*?)\s*~\s*\(([^)]*)\)\s*$/);
      if (!idMatch || !textMatch) continue;
      items.push({
        id: parseInt(idMatch[1], 10),
        title: textMatch[1].trim(),
        time: textMatch[2].trim(),
      });
    }
    return { day: DAY_NAMES[i], items };
  });
}

/** Загрузка HTML одной попыткой с таймаутом (AbortController). */
async function fetchHtmlOnce(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`источник вернул ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Загрузить HTML главной: перебираем прямую и прокси, первый успешный —
 * наш. Ни один не сработал — бросаем последнюю ошибку.
 */
async function fetchScheduleHtml(): Promise<string> {
  let lastError: unknown = new Error('нет доступных источников');
  for (const build of PROXY_BUILDERS) {
    try {
      return await fetchHtmlOnce(build(SITE_URL));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

let inflight: Promise<void> | null = null;
let lastError: string | null = null; // последняя ошибка обновления — для показа на экране
const listeners = new Set<() => void>();

/** Последняя ошибка refreshSchedule (null, если последний запуск успешен). */
export function getScheduleError(): string | null {
  return lastError;
}

/** Подписка на обновление кэша расписания. Возвращает функцию отписки. */
export function subscribeSchedule(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  for (const fn of listeners) fn();
}

/**
 * Загрузить и распарсить главную, обновить кэш при изменениях.
 * Повторные вызовы до завершения переиспользуют тот же запрос (dedupe).
 * Бросает ошибку сети/парсинга — вызывающий решает, что делать
 * (при запуске приложения просто остаёмся на кэше).
 */
export async function refreshSchedule(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const html = await fetchScheduleHtml();
      const days = parseSchedule(html);
      const total = days.reduce((sum, d) => sum + d.items.length, 0);
      if (!total) throw new Error('блок расписания не найден в HTML');
      const cached = await getCachedSchedule();
      if (!cached || JSON.stringify(cached.days) !== JSON.stringify(days)) {
        await saveScheduleCache(days);
      }
      lastError = null;
      notifyListeners();
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      notifyListeners(); // экран покажет ошибку, если кэша ещё нет
      throw e;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
