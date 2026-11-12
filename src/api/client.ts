import { API_BASE_URL } from './config';

/**
 * Обёртка над fetch. Формат ответа API (PLAN §5):
 *   { state: { status: 'ok', count: N }, data: [...] }
 * Возвращает { data, count }; count может быть null, если API его не прислал.
 * Порт нативного src/api/client.js.
 */

export type ApiQuery = Record<string, string | number | undefined | null>;
export interface ApiResult<T> {
  data: T;
  count: number | null;
}

async function request<T>(
  path: string,
  { method = 'GET', query = {}, form = {} }: { method?: string; query?: ApiQuery; form?: ApiQuery } = {},
): Promise<ApiResult<T>> {
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = `${API_BASE_URL}/${path}${qs ? `?${qs}` : ''}`;

  const options: RequestInit = {
    method,
    // референс шлёт этот заголовок на любой запрос — воспроизводим
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  };
  if (method === 'POST') {
    options.body = new URLSearchParams(
      Object.entries(form).filter(([, v]) => v !== undefined && v !== null) as [string, string][],
    ).toString();
  }

  let res: Response;
  try {
    res = await fetch(url, options);
  } catch {
    throw new Error(`Сеть недоступна (${path})`);
  }
  if (!res.ok) {
    throw new Error(`API вернул ${res.status} (${path})`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Некорректный ответ API (${path})`);
  }
  // У большинства эндпоинтов обёртка { state, data }, но `genres` возвращает
  // плоский словарь без неё — принимаем оба формата.
  const envelope = body as { state?: { status?: string; count?: number | null }; data?: T };
  if (envelope?.state) {
    if (envelope.state.status !== 'ok') {
      throw new Error(`Ошибка API (${path})`);
    }
    return { data: envelope.data as T, count: envelope.state.count ?? null };
  }
  return { data: body as T, count: null };
}

export const api = {
  get: <T>(path: string, query: ApiQuery = {}) => request<T>(path, { query }),
  post: <T>(path: string, form: ApiQuery = {}) => request<T>(path, { method: 'POST', form }),
};
