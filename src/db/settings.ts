import { getDb } from './index';

/**
 * Сервис настроек — порт нативного src/db/settings.js.
 * Значения — JSON в хранилище settings.
 */

/** Значения по умолчанию. Ключи фиксируем здесь. */
export const SETTINGS_DEFAULTS = {
  playerQuality: '720' as '720' | '480', // качество по умолчанию
  playerAutoNext: true, // автопереход к следующей серии
  playerStretch: false, // растягивать видео по ширине экрана
  playerSeekMode: 'both' as 'swipe' | 'doubletap' | 'both', // (двойной тап = ±10 сек фиксировано)
};

export type SettingsMap = typeof SETTINGS_DEFAULTS;

export async function getSetting<K extends keyof SettingsMap>(
  key: K,
): Promise<SettingsMap[K] | null> {
  const db = await getDb();
  const row = await db.get('settings', key);
  if (!row) return key in SETTINGS_DEFAULTS ? SETTINGS_DEFAULTS[key] : null;
  try {
    return JSON.parse(row.value) as SettingsMap[K];
  } catch {
    return row.value as unknown as SettingsMap[K];
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('settings', { key, value: JSON.stringify(value) });
}

/** Все настройки сразу (для экрана настроек). */
export async function getAllSettings(): Promise<SettingsMap> {
  const db = await getDb();
  const rows = await db.getAll('settings');
  const result = { ...SETTINGS_DEFAULTS };
  for (const row of rows) {
    try {
      (result as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {
      (result as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return result;
}
