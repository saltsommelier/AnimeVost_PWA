import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * IndexedDB (PLAN §6): открытие БД, миграции, сид встроенных списков.
 * Схема зеркалит SQLite нативного (src/db/index.js, версия 3).
 * Экраны работают с БД только через сервисы db/.
 */

export const DB_NAME = 'animevost';
export const DATABASE_VERSION = 3;

/** Встроенные списки (PLAN §5.4 нативного). Правила защиты:
 *  - История: нельзя удалить и скрыть (автозаполняется плеером)
 *  - остальные встроенные: удалить нельзя, скрыть можно
 *  - пользовательские: удалять можно (removable = 1) */
export const BUILTIN_LISTS = [
  { key: 'history', name: 'История', hidable: false },
  { key: 'favorites', name: 'Избранное', hidable: true },
  { key: 'watching', name: 'Смотрю', hidable: true },
  { key: 'planned', name: 'Запланировано', hidable: true },
  { key: 'rewatching', name: 'Пересматриваю', hidable: true },
  { key: 'onhold', name: 'Отложено', hidable: true },
  { key: 'watched', name: 'Просмотрено', hidable: true }, // авто-перенос из Истории — переключатель в настройках
] as const;

/** Список (закладок): встроенный или пользовательский. */
export interface ListRow {
  id: number;
  /** Стабильный ключ встроенного ('history', 'favorites', …); у пользовательских — null. */
  key: string | null;
  name: string;
  position: number;
  is_builtin: 0 | 1;
  removable: 0 | 1;
  hidable: 0 | 1;
  hidden: 0 | 1;
  auto_from_history: 0 | 1;
}

/** Снапшот тайтла внутри списка. */
export interface ListItemRow {
  list_id: number;
  anime_id: number;
  title: string;
  preview: string | null;
  description: string | null;
  rating: number | null;
  votes: number | null;
  added_at: number;
}

/** Запись истории просмотра (автозаполняется плеером). */
export interface HistoryRow {
  anime_id: number;
  title: string;
  preview: string | null;
  description: string | null;
  rating: number | null;
  votes: number | null;
  episode_name: string | null;
  episode_number: number | null;
  position_sec: number;
  duration_sec: number;
  watched_pct: number;
  updated_at: number;
}

/** Настройка: JSON-значение по строковому ключу. */
export interface SettingRow {
  key: string;
  value: string;
}

interface AnimeVostDB extends DBSchema {
  lists: {
    key: number;
    value: ListRow;
    indexes: { 'by-key': string };
  };
  list_items: {
    key: [number, number];
    value: ListItemRow;
    indexes: { 'by-list': number };
  };
  history: {
    key: number;
    value: HistoryRow;
    indexes: { 'by-updated': number };
  };
  settings: {
    key: string;
    value: SettingRow;
  };
  schedule_cache: {
    key: number;
    value: { id: number; json: string; updated_at: number };
  };
  info_cache: {
    key: number;
    value: { anime_id: number; json: string; updated_at: number };
  };
}

export type Db = IDBPDatabase<AnimeVostDB>;

let dbPromise: Promise<Db> | null = null;

/** Ленивый синглтон БД — один экземпляр на приложение. */
export function getDb(): Promise<Db> {
  if (!dbPromise) dbPromise = openDatabase();
  return dbPromise;
}

async function openDatabase(): Promise<Db> {
  return openDB<AnimeVostDB>(DB_NAME, DATABASE_VERSION, {
    upgrade(db, _oldVersion, _newVersion, tx) {
      // v1: основные хранилища + сид встроенных списков
      const lists = db.createObjectStore('lists', { keyPath: 'id', autoIncrement: true });
      lists.createIndex('by-key', 'key', { unique: true });

      const listItems = db.createObjectStore('list_items', {
        keyPath: ['list_id', 'anime_id'],
      });
      listItems.createIndex('by-list', 'list_id');

      const history = db.createObjectStore('history', { keyPath: 'anime_id' });
      history.createIndex('by-updated', 'updated_at');

      db.createObjectStore('settings', { keyPath: 'key' });

      // v2: кэш расписания — одна строка id=1 с JSON всех дней
      db.createObjectStore('schedule_cache', { keyPath: 'id' });

      // v3: кэш карточек getInfo (карточки расписания строятся из них)
      db.createObjectStore('info_cache', { keyPath: 'anime_id' });

      // Сид встроенных списков: id даёт autoIncrement, порядок = position
      BUILTIN_LISTS.forEach((list, i) => {
        void tx
          .objectStore('lists')
          .add({
            key: list.key,
            name: list.name,
            position: i,
            is_builtin: 1,
            removable: 0,
            hidable: list.hidable ? 1 : 0,
            hidden: 0,
            auto_from_history: 0,
          } as ListRow);
      });
    },
  });
}
