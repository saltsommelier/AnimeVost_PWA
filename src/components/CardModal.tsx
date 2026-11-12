import { useEffect, useState } from 'react';
import { IoHeart, IoHeartOutline } from 'react-icons/io5';
import { getInfo } from '../api/anime';
import type { Title } from '../api/types';
import type { ListRow } from '../db';
import * as listsDb from '../db/lists';
import './components.css';

/**
 * Модальное окно долгого нажатия по карточке — порт нативного
 * src/components/CardModal.js: избранное, списки, таймер новой серии.
 * Открывается из двух мест: долгий тап по AnimeCard (правый клик на ПК)
 * и кнопка-закладка на странице тайтла (этап 3).
 */
export default function CardModal({
  open,
  item,
  name,
  announcement,
  onClose,
}: {
  open: boolean;
  item: Title;
  name: string;
  announcement: boolean;
  onClose: () => void;
}) {
  const [lists, setLists] = useState<ListRow[]>([]);
  const [membership, setMembership] = useState<Record<number, boolean>>({});
  const [timerInfo, setTimerInfo] = useState<number | null>(null); // null — грузим

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      // списки (кроме Истории — она автозаполняется) + что уже где лежит
      const [allLists, historyList] = await Promise.all([
        listsDb.getLists({ includeHidden: false }),
        listsDb.getListByKey('history'),
      ]);
      const shown = allLists.filter((l) => l.id !== historyList?.id);
      const flags: Record<number, boolean> = {};
      for (const list of shown) {
        flags[list.id] = await listsDb.isInList(list.id, item.id);
      }
      if (!cancelled) {
        setLists(shown);
        setMembership(flags);
      }
      // таймер: в `last` ненадёжен — одноразово дёргаем info (PLAN §4)
      try {
        const info = await getInfo(item.id);
        if (!cancelled) setTimerInfo(info?.timer ?? 0);
      } catch {
        if (!cancelled) setTimerInfo(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, item.id]);

  // Esc закрывает модалку — веб-эквивалент onRequestClose нативного
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const favorites = lists.find((l) => l.key === 'favorites');
  const isFavorite = favorites ? membership[favorites.id] : false;
  const hasTimer = Boolean(timerInfo && timerInfo > 0);
  // снапшот карточки — чтобы списки рендерились полными без повторных запросов
  const cardPayload = {
    animeId: item.id,
    title: item.title,
    preview: item.urlImagePreview,
    description: item.description ?? null,
    rating: item.rating ?? null,
    votes: item.votes ?? null,
  };

  async function toggleFavorite() {
    if (!favorites) return;
    const added = await listsDb.toggleList(favorites.id, cardPayload);
    setMembership((m) => ({ ...m, [favorites.id]: added }));
  }

  async function toggleListItem(list: ListRow) {
    const added = await listsDb.toggleList(list.id, cardPayload);
    setMembership((m) => ({ ...m, [list.id]: added }));
  }

  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalTitle">{name}</div>

        {favorites && (
          <button
            type="button"
            className={`modalRow ${isFavorite ? 'modalRowAccent' : ''}`}
            onClick={toggleFavorite}
          >
            {isFavorite ? <IoHeart size={20} /> : <IoHeartOutline size={20} />}
            <span>{isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}</span>
          </button>
        )}

        {lists.filter((l) => l.key !== 'favorites').length > 0 && (
          <div className="sectionLabel">Добавить в список…</div>
        )}
        <div className="chipsWrap">
          {lists
            .filter((l) => l.key !== 'favorites')
            .map((list) => (
              <button
                type="button"
                key={list.id}
                className={`chip ${membership[list.id] ? 'chipActive' : ''}`}
                onClick={() => toggleListItem(list)}
              >
                {list.name}
              </button>
            ))}
        </div>

        <div className="timerBox">
          {announcement ? (
            <div className="timerText">Анонс — дата выхода неизвестна</div>
          ) : timerInfo === null ? (
            <div className="timerText muted">Узнаём…</div>
          ) : hasTimer ? (
            <div className="timerText">
              Новая серия: {new Date(timerInfo * 1000).toLocaleString('ru-RU')}
            </div>
          ) : (
            <div className="timerText">Серии выходят по мере возможности</div>
          )}
        </div>
      </div>
    </div>
  );
}

