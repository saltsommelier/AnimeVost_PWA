import { useEffect, useState } from 'react';
import { IoBookmarkOutline, IoPlay, IoTimeOutline } from 'react-icons/io5';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { getInfo, getPlaylist } from '../api/anime';
import { imageUrl } from '../api/images';
import { isAnnouncement, rating10, resort, seriesFromTitle, titleName } from '../api/parsers';
import type { Episode, Title } from '../api/types';
import CardModal from '../components/CardModal';
import ScreenHeader from '../components/ScreenHeader';
import * as historyDb from '../db/history';
import { Spinner } from './HomeScreen';
import './screens.css';

/** Аргументы перехода в плеер (native navigation.navigate('Player', …)). */
export interface PlayerRouteState {
  id: number;
  title: string;
  episodes: Episode[];
  index: number;
}

/**
 * Экран тайтла — порт нативного src/screens/TitleScreen.js: большой постер,
 * Play, инфо-блок (год, тип, эпизоды, режиссёр), таймер, полное описание,
 * список серий. У анонсов плеера нет (PLAN §4) — кнопку Play и серии
 * не показываем.
 */
export default function TitleScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: idParam } = useParams();
  const id = Number(idParam);

  const [info, setInfo] = useState<Title | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedEpisode, setSavedEpisode] = useState(0); // продолжить с серии N
  const [listModal, setListModal] = useState(false); // окно «добавить в список»

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [cardData, list] = await Promise.all([getInfo(id), getPlaylist(id)]);
        if (cancelled) return;
        setInfo(cardData);
        setEpisodes(resort(list));
        const hist = await historyDb.getHistoryItem(id);
        if (!cancelled && hist?.episode_number != null) setSavedEpisode(hist.episode_number);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="screen">
        <ScreenHeader title="…" />
        <div className="center">
          <Spinner />
        </div>
      </div>
    );
  }
  if (error || !info) {
    return (
      <div className="screen">
        <ScreenHeader title="Ошибка" />
        <div className="center">
          <div className="empty">{error ?? 'Тайтл не найден'}</div>
        </div>
      </div>
    );
  }

  const name = titleName(info.title);
  const rating = rating10(info);
  const announcement = isAnnouncement(info.title);
  const episodesLabel = seriesFromTitle(info.title);
  // превью из info бывает пустым — тогда берём из состояния навигации
  // (прислали с той карточки, с которой тапнули)
  const cardState = (location.state ?? null) as { preview?: string | null } | null;
  const preview = info.urlImagePreview || cardState?.preview;
  const modalItem: Title = { ...info, urlImagePreview: preview };

  function openPlayer(index: number) {
    navigate('/player', {
      state: { id: info!.id, title: info!.title, episodes, index } satisfies PlayerRouteState,
    });
  }

  return (
    <div className="screen">
      <ScreenHeader title={name} />
      <div className="titleContent">
        <div className="hero">
          <img className="heroPoster" src={imageUrl(preview)} alt="" />
          <div className="heroInfo">
            {rating > 0 && (
              <span className={`ratingBadge titleRating ${ratingClass(rating)}`}>
                {rating.toFixed(2)}
              </span>
            )}
            <InfoRow label="Год" value={info.year} />
            <InfoRow label="Тип" value={info.type} />
            <InfoRow label="Эпизоды" value={episodesLabel || null} />
            <InfoRow label="Режиссёр" value={info.director} />
          </div>
        </div>

        {!announcement && episodes.length > 0 && (
          <button type="button" className="playButton" onClick={() => openPlayer(savedEpisode)}>
            <IoPlay size={22} />
            <span>
              {savedEpisode > 0 ? `Продолжить: ${episodes[savedEpisode]?.name ?? ''}` : 'Смотреть'}
            </span>
          </button>
        )}

        {announcement && (
          <div className="announceBox">
            <div className="announceText">Анонс — серии ещё не вышли</div>
          </div>
        )}

        <div className="titleMetaRow">
          <div className="titleMetaInfo">
            <div className="timerBox">
              <IoTimeOutline size={18} />
              <span className="timerText">
                {info.timer && info.timer > 0
                  ? `Новая серия: ${new Date(info.timer * 1000).toLocaleDateString('ru-RU')}`
                  : 'Серии выходят по мере возможности'}
              </span>
            </div>
            {info.genre ? <div className="titleGenre">{info.genre}</div> : null}
          </div>

          <button
            type="button"
            className="listButton"
            onClick={() => setListModal(true)}
            aria-label="Добавить в список"
            title="Добавить в список"
          >
            <IoBookmarkOutline size={26} />
          </button>
        </div>

        <div className="titleSection">Описание</div>
        <div className="titleDescription">
          {info.description?.trim() || 'Описание отсутствует'}
        </div>

        {!announcement && episodes.length > 0 && (
          <>
            <div className="titleSection">Серии ({episodes.length})</div>
            <div className="episodeWrap">
              {episodes.map((ep, idx) => (
                <button
                  type="button"
                  key={`${ep.name}-${idx}`}
                  className={`episodeChip ${idx === savedEpisode ? 'chipActive' : ''}`}
                  onClick={() => openPlayer(idx)}
                >
                  {ep.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <CardModal
        open={listModal}
        item={modalItem}
        name={name}
        announcement={announcement}
        onClose={() => setListModal(false)}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value) return null;
  return (
    <div className="infoRow">
      <span className="infoLabel">{label}</span>
      <span className="infoValue">{value}</span>
    </div>
  );
}

/** Цвет бейджа рейтинга — та же логика, что в AnimeCard (theme.ratingColor). */
function ratingClass(value: number): string {
  if (value > 7) return 'ratingHigh';
  if (value > 4) return 'ratingMiddle';
  return 'ratingLow';
}
