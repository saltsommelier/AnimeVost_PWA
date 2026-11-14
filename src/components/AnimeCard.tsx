import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { imageUrl } from '../api/images';
import { isAnnouncement, rating10, titleName, yearText } from '../api/parsers';
import type { Title } from '../api/types';
import CardModal from './CardModal';
import { useLongPress } from '../lib/useLongPress';
import './components.css';

/**
 * Карточка аниме — одна и та же во всех лентах (порт нативного
 * src/components/AnimeCard.js): постер 2:3 слева, справа: название →
 * рейтинг → описание (3 строки). Полоска прогресса — только в ленте
 * Истории (через `progress`). `meta` — строка справа от рейтинга
 * (на главной — дата новой серии, в расписании — время выхода).
 * Долгое нажатие → модалка: избранное, списки, таймер новой серии.
 * На ПК долгое нажатие не существует — то же меню по правому клику.
 */
export default function AnimeCard({
  item,
  progress = null,
  meta = null,
}: {
  item: Title;
  progress?: number | null;
  meta?: string | null;
}) {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const { handlers, consumeFired } = useLongPress(() => setModalOpen(true));

  const name = titleName(item.title);
  const rating = rating10(item);
  const announcement = isAnnouncement(item.title);

  return (
    <>
      <div
        className="card"
        {...handlers}
        onClick={() => {
          // после долгого нажатия click подавляем — уже открыли модалку
          if (consumeFired()) return;
          navigate(`/title/${item.id}`);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate(`/title/${item.id}`);
          }
        }}
      >
        <div className="posterWrap">
          <img className="poster" src={imageUrl(item.urlImagePreview)} alt="" loading="lazy" />
          {announcement && <span className="announceTag">Анонс</span>}
        </div>
        <div className="cardInfo">
          <div className="cardName">{name}</div>
          {(rating > 0 || meta) && (
            <div className="ratingRow">
              {rating > 0 && <span className={`ratingBadge ${ratingClass(rating)}`}>{rating.toFixed(2)}</span>}
              {meta != null && <span className="metaText">{meta}</span>}
            </div>
          )}
          {yearText(item.year) && <div className="cardYear">{yearText(item.year)}</div>}
          <div className="cardDescription">
            {item.description?.trim() || 'Описание отсутствует'}
          </div>
        </div>
        {progress != null && (
          <div className="progressTrack">
            <div className="progressFill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>

      <CardModal
        open={modalOpen}
        item={item}
        name={name}
        announcement={announcement}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

/** Цвет бейджа рейтинга — логика нативного theme.ratingColor. */
function ratingClass(value: number): string {
  if (value > 7) return 'ratingHigh';
  if (value > 4) return 'ratingMiddle';
  return 'ratingLow';
}
