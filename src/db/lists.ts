import { getDb, type ListRow, type ListItemRow } from './index';
/**
 * Сервис списков (закладок) — порт нативного src/db/lists.js.
 * Правила защиты списков — PLAN §5.5 нативного; UI показывает
 * подтверждения, сервис дополнительно страхует встроенные списки.
 */

/** Все списки по порядку. includeHidden=false — без скрытых. */
export async function getLists({ includeHidden = true } = {}): Promise<ListRow[]> {
  const db = await getDb();
  const rows = await db.getAll('lists');
  rows.sort((a, b) => a.position - b.position || a.id - b.id);
  return includeHidden ? rows : rows.filter((l) => !l.hidden);
}

/** Список по key (например 'favorites', 'history'). */
export async function getListByKey(key: string): Promise<ListRow | undefined> {
  const db = await getDb();
  return db.getFromIndex('lists', 'by-key', key);
}

/** Создать пользовательский список. Возвращает id. */
export async function createList(name: string): Promise<number> {
  const db = await getDb();
  const trimmed = String(name ?? '').trim();
  if (!trimmed) throw new Error('Название списка пустое');
  const all = await db.getAll('lists');
  const position = all.reduce((max, l) => Math.max(max, l.position), -1) + 1;
  return db.add('lists', {
    key: null,
    name: trimmed,
    position,
    is_builtin: 0,
    removable: 1,
    hidable: 1,
    hidden: 0,
    auto_from_history: 0,
  } as ListRow);
}

/** Удалить список. Пользовательские — можно; встроенные — нельзя (PLAN §5.5). */
export async function deleteList(id: number): Promise<void> {
  const db = await getDb();
  const list = await db.get('lists', id);
  if (!list) return;
  if (list.is_builtin) throw new Error('Встроенные списки удалять нельзя');
  const tx = db.transaction(['list_items', 'lists'], 'readwrite');
  await Promise.all([
    // индекс by-list хранит list_id — удаляем все элементы списка
    tx.objectStore('list_items').index('by-list').getAll(id).then((rows) =>
      Promise.all(rows.map((r) => tx.objectStore('list_items').delete([r.list_id, r.anime_id]))),
    ),
    tx.objectStore('lists').delete(id),
    tx.done,
  ]);
}

/** Скрыть/показать список. Историю скрыть нельзя. */
export async function setHidden(id: number, hidden: boolean): Promise<void> {
  const db = await getDb();
  const list = await db.get('lists', id);
  if (!list) throw new Error('Список не найден');
  if (!list.hidable) throw new Error('Этот список нельзя скрыть');
  await db.put('lists', { ...list, hidden: hidden ? 1 : 0 });
}

/** Переключатель «авто-перенос из Истории» (только у «Просмотрено»). */
export async function setAutoFromHistory(id: number, enabled: boolean): Promise<void> {
  const db = await getDb();
  const list = await db.get('lists', id);
  if (!list) return;
  await db.put('lists', { ...list, auto_from_history: enabled ? 1 : 0 });
}

/** Элементы списка, свежие сверху. */
export async function getListItems(listId: number): Promise<ListItemRow[]> {
  const db = await getDb();
  const rows = await db.getAllFromIndex('list_items', 'by-list', listId);
  rows.sort((a, b) => b.added_at - a.added_at);
  return rows;
}

export async function isInList(listId: number, animeId: number): Promise<boolean> {
  const db = await getDb();
  return Boolean(await db.get('list_items', [listId, animeId]));
}

/** Данные для снапшота тайтла в списке. */
export interface ListSnapshot {
  animeId: number;
  title: string;
  preview?: string | null;
  description?: string | null;
  rating?: number | null;
  votes?: number | null;
}

export async function addToList(listId: number, item: ListSnapshot): Promise<void> {
  const db = await getDb();
  await db.put('list_items', {
    list_id: listId,
    anime_id: item.animeId,
    title: item.title,
    preview: item.preview ?? null,
    description: item.description ?? null,
    rating: item.rating ?? null,
    votes: item.votes ?? null,
    added_at: Date.now(),
  });
}

export async function removeFromList(listId: number, animeId: number): Promise<void> {
  const db = await getDb();
  await db.delete('list_items', [listId, animeId]);
}

/** Переключить присутствие тайтла в списке. Возвращает: true — добавлен. */
export async function toggleList(listId: number, item: ListSnapshot): Promise<boolean> {
  if (await isInList(listId, item.animeId)) {
    await removeFromList(listId, item.animeId);
    return false;
  }
  await addToList(listId, item);
  return true;
}

export interface ListCountRow {
  list_id: number;
  count: number;
}

/** Кол-во аниме в каждом списке — для экрана Профиль (PLAN §5.4). */
export async function getListItemCounts(): Promise<ListCountRow[]> {
  const db = await getDb();
  const rows = await db.getAll('list_items');
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.list_id, (counts.get(r.list_id) ?? 0) + 1);
  return [...counts.entries()].map(([list_id, count]) => ({ list_id, count }));
}
