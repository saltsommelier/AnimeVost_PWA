import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IoArrowBack,
  IoContract,
  IoExpand,
  IoPause,
  IoPlay,
  IoPlaySkipBack,
  IoPlaySkipForward,
} from 'react-icons/io5';
import { useNavigate, useLocation } from 'react-router-dom';
import { getInfo } from '../api/anime';
import { titleName } from '../api/parsers';
import { videoUrl } from '../api/video';
import type { Episode, Title } from '../api/types';
import * as historyDb from '../db/history';
import * as settingsDb from '../db/settings';
import type { PlayerRouteState } from './TitleScreen';
import './screens.css';

/**
 * Плеер — порт нативного src/screens/PlayerScreen.js (PLAN §8):
 * fullscreen <video>, HD/SD, лента серий чипами, prev/next, автопереход
 * (настройка). Тип перемотки — настройка: свайп / двойной тап (±10 сек) /
 * оба. Плеер пишет Историю (позиция, % досмотра).
 *
 * Архитектура касаний — те же уроки нативного (см. комментарий там):
 *  - жесты НЕ перехватывают тапы кнопок: свайп захватывается только после
 *    порога (pointer capture ставится на первом горизонтальном движении);
 *  - тапы ловит отдельный слой на всю площадь видео: одиночный — показать/
 *    скрыть управление мгновенно (без ожидания двойного), двойной — ±10 сек;
 *  - панели всегда в дереве, скрытие — CSS transition, касания отключаются;
 *  - автоскрытие через 4 сек, пока играет; на паузе остаётся; во время
 *    драга по линии прогресса не прячется (иначе жест оборвётся);
 *  - в DOM нет багов locationX/пересоздания PanResponder: координаты считаем
 *    от clientX минус rect, pointer capture держит жест целиком.
 *
 * Отличия от нативного (PLAN §8, §12): duration браузер отдаёт сам
 * (loadedmetadata) — probeDuration не нужен; Android — fullscreen +
 * orientation.lock('landscape'), iOS lock не умеет (видео остаётся
 * в портрете; подсказка «поверни телефон» удалена по решению юзера).
 */

const SWIPE_PX_PER_SEC = 4; // 4px ≈ 1 сек перемотки свайпом
const DBL_TAP_MS = 300; // окно распознавания двойного тапа
const CONTROLS_HIDE_MS = 4000; // автоскрытие управления
const SWIPE_THRESHOLD_PX = 12; // порог захвата свайпа (как в нативном)

/** Ландшафт-лок — нестандартный Chrome API (PLAN §8), TS DOM его не типирует.
 *  Возвращает Promise<void> и на платформах без lock (iOS/ПК) — просто resolve. */
type LockableOrientation = ScreenOrientation & {
  lock?(orientation: string): Promise<void>;
  unlock?(): void;
};

function lockLandscape(): Promise<void> {
  const orientation = screen.orientation as LockableOrientation | undefined;
  return orientation?.lock?.('landscape') ?? Promise.resolve();
}

function unlockOrientation(): void {
  const orientation = screen.orientation as LockableOrientation | undefined;
  try {
    orientation?.unlock?.();
  } catch {
    /* ignore */
  }
}

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = m > 0 || h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`;
}

export default function PlayerScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = (location.state ?? null) as PlayerRouteState | null;

  const [index, setIndex] = useState(params?.index ?? 0);
  const [quality, setQuality] = useState<'HD' | 'SD'>('HD');
  const [paused, setPaused] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [controls, setControls] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [seekHint, setSeekHint] = useState<string | null>(null); // '±N c' свайпа/даблтапа
  const [scrub, setScrub] = useState<number | null>(null); // секунда под пальцем на линии
  const [info, setInfo] = useState<Title | null>(null);
  const [settings, setSettings] = useState<settingsDb.SettingsMap | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef(0);
  const lastSavedRef = useRef(0);
  // Актуальные позиция/длительность для жестов — читаются из рефов,
  // чтобы обработчики не пересоздавались каждые ~0.5 с (урок нативного).
  const posRef = useRef(0);
  const durRef = useRef(0);

  const episodes: Episode[] = params?.episodes ?? [];
  const episode = episodes[index];

  // настройки + инфо тайтла (для снапшота в Истории)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [allSettings, cardInfo] = await Promise.all([
        settingsDb.getAllSettings(),
        getInfo(params?.id ?? 0).catch(() => null),
      ]);
      if (cancelled) return;
      setSettings(allSettings);
      setInfo(cardInfo);
      setQuality(allSettings.playerQuality === '480' ? 'SD' : 'HD');
    })();
    return () => {
      cancelled = true;
    };
  }, [params?.id]);

  // сброс позиции при смене серии/качества
  useEffect(() => {
    posRef.current = 0;
    lastSavedRef.current = 0;
    setPosition(0);
    setPaused(false);
  }, [index, quality]);

  // пауза/воспроизведение — императивно, состояние только для иконок
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !episode) return;
    if (paused) {
      v.pause();
    } else {
      void v.play().catch(() => {});
    }
  }, [paused, episode]);

  // плеер открываем во весь экран с ландшафтом, при выходе возвращаем
  // (PLAN §8). iOS lock не умеет — там видео остаётся в портрете.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap && !document.fullscreenElement) {
      void wrap.requestFullscreen().catch(() => {});
    }
    void lockLandscape().catch(() => {});
    return () => {
      unlockOrientation();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seekMode = settings?.playerSeekMode ?? 'both';
  const autoNext = settings?.playerAutoNext ?? true;
  const stretch = settings?.playerStretch ?? false;
  // где живут play/pause + prev/next: 'video' — в центре видео одной строкой,
  // 'panel' — в нижней панели, 'both' — как раньше (центр + группа над панелью)
  const controlsLayout = settings?.playerControls ?? 'both';
  const showStrip = settings?.playerEpisodesStrip ?? true;

  const seekTo = useCallback((sec: number) => {
    const max = durRef.current > 0 ? durRef.current : sec;
    const target = Math.min(Math.max(sec, 0), max);
    posRef.current = target;
    if (videoRef.current) videoRef.current.currentTime = target;
    setPosition(target);
  }, []);

  const seekBy = useCallback(
    (secs: number) => {
      seekTo((posRef.current || 0) + secs);
      setSeekHint(`${secs > 0 ? '+' : ''}${secs} с`);
      setTimeout(() => setSeekHint(null), 600);
    },
    [seekTo],
  );

  /** Запись Истории (не чаще раза в 5 секунд), PLAN §5.4. */
  const saveProgress = useCallback(
    (currentTime: number, dur: number, finished = false) => {
      if (!params?.id || !params?.title) return;
      const now = Date.now();
      if (!finished && now - lastSavedRef.current < 5000) return;
      lastSavedRef.current = now;
      void historyDb
        .upsertHistory({
          animeId: params.id,
          title: params.title,
          preview: info?.urlImagePreview ?? null,
          description: info?.description ?? null,
          rating: info?.rating ?? null,
          votes: info?.votes ?? null,
          episodeName: episode?.name ?? null,
          episodeNumber: index,
          positionSec: currentTime,
          durationSec: dur,
        })
        .catch(() => {});
    },
    [params?.id, params?.title, info, episode, index],
  );

  function goToEpisode(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= episodes.length) return;
    setIndex(nextIndex);
  }

  /** Кнопка «на весь экран»: вход/выход из fullscreen (+ ландшафт). */
  async function toggleFullscreen() {
    const wrap = wrapRef.current;
    if (!document.fullscreenElement && wrap) {
      try {
        await wrap.requestFullscreen();
        setFullscreen(true);
      } catch {
        /* iOS: только нативный видеоплеер — игнорируем */
      }
      try {
        await lockLandscape();
      } catch {
        /* iOS/ПК не умеют — ок */
      }
    } else {
      try {
        await document.exitFullscreen();
      } catch {
        /* ignore */
      }
      unlockOrientation();
      setFullscreen(false);
    }
  }

  /** Одиночный/двойной тап по видео. x — координата внутри wrap. */
  function handleTap(x: number, width: number) {
    const now = Date.now();
    if (now - lastTapRef.current < DBL_TAP_MS) {
      // двойной тап: ±10 сек (левая/правая половина), режим doubletap/both
      lastTapRef.current = 0;
      if (seekMode === 'doubletap' || seekMode === 'both') {
        seekBy(x < width / 2 ? -10 : 10);
      }
      return;
    }
    lastTapRef.current = now;
    // одиночный тап — мгновенно показать/скрыть управление
    setControls((c) => !c);
  }

  // Слой тапов + свайп-перемотка (pointer events; capture после порога —
  // DOM-аналог PanResponder нативного: не перехватываем касание на старте).
  const gesture = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    swiping: false,
  });

  function onSurfacePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    gesture.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, swiping: false };
  }

  function onSurfacePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (g.pointerId !== e.pointerId || g.swiping) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    // захватываем ТОЛЬКО горизонтальный жест после порога
    if (
      (seekMode === 'swipe' || seekMode === 'both') &&
      Math.abs(dx) > SWIPE_THRESHOLD_PX &&
      Math.abs(dx) > Math.abs(dy)
    ) {
      g.swiping = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setControls(true);
      setSeekHint('+0 с');
    }
  }

  function onSurfacePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (g.pointerId !== e.pointerId) return;
    gesture.current = { pointerId: null, startX: 0, startY: 0, swiping: false };
    const rect = e.currentTarget.getBoundingClientRect();
    if (g.swiping) {
      // завершение свайпа: применяем перемотку (dx в px → сек)
      const secs = Math.round((e.clientX - g.startX) / SWIPE_PX_PER_SEC);
      setSeekHint(null);
      if (secs !== 0) seekBy(secs);
      return;
    }
    handleTap(e.clientX - rect.left, rect.width);
  }

  // Тап/драг по линии прогресса: превью под пальцем, на отпускании — прыжок.
  // setPointerCapture = жест неотчуждаем (уроки b53b084/ede01d1 нативного).
  const scrubRef = useRef(0); // x под пальцем

  function xToTime(x: number, w: number): number {
    if (w <= 0 || durRef.current <= 0) return 0;
    const frac = Math.min(1, Math.max(0, x / w));
    return frac * durRef.current;
  }

  function onScrubPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (durRef.current <= 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    scrubRef.current = e.clientX - rect.left;
    setControls(true);
    setScrub(xToTime(scrubRef.current, rect.width));
  }

  function onScrubPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (scrub == null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    scrubRef.current = e.clientX - rect.left;
    setScrub(xToTime(scrubRef.current, rect.width));
  }

  function onScrubPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (scrub == null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const target = xToTime(scrubRef.current, rect.width);
    setScrub(null);
    seekTo(target);
  }

  // автоскрытие управления, пока играет видео; во время драга по линии
  // прогресса не прячем — иначе жест оборвётся и перемотка отменится
  useEffect(() => {
    if (!controls || paused || scrub != null) return undefined;
    const t = setTimeout(() => setControls(false), CONTROLS_HIDE_MS);
    return () => clearTimeout(t);
  }, [controls, paused, index, quality, scrub]);

  // Wake Lock (PLAN §8): экран не гаснет, пока видео играет
  useEffect(() => {
    if (paused || !episode) return undefined;
    let sentinel: { release(): Promise<void> } | null = null;
    let released = false;
    void navigator.wakeLock
      ?.request('screen')
      .then((s) => {
        if (released) void s.release().catch(() => {});
        else sentinel = s;
      })
      .catch(() => {});
    return () => {
      released = true;
      void sentinel?.release().catch(() => {});
    };
  }, [paused, episode]);

  // MediaSession (PLAN §8): локскрин/наушники
  useEffect(() => {
    if (!('mediaSession' in navigator) || !episode) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: titleName(params?.title ?? ''),
      artist: episode.name,
      artwork: info?.urlImagePreview ? [{ src: info.urlImagePreview }] : [],
    });
    ms.setActionHandler('play', () => setPaused(false));
    ms.setActionHandler('pause', () => setPaused(true));
    ms.setActionHandler('previoustrack', () => goToEpisode(index - 1));
    ms.setActionHandler('nexttrack', () => goToEpisode(index + 1));
    return () => {
      ms.setActionHandler('play', null);
      ms.setActionHandler('pause', null);
      ms.setActionHandler('previoustrack', null);
      ms.setActionHandler('nexttrack', null);
    };
  }, [episode, index, params?.title, info?.urlImagePreview]);

  const hasPrev = index > 0;
  const hasNext = index < episodes.length - 1;
  // во время драга по линии показываем позицию под пальцем (scrub)
  const shownTime = scrub ?? position;
  const progressNum = duration > 0 ? Math.min(100, Math.max(0, (shownTime / duration) * 100)) : 0;
  const progressPct = `${progressNum}%`;

  if (!params || !episode) {
    return (
      <div className="plScreen">
        <div className="plTop">
          <button type="button" className="plIconBtn" onClick={() => navigate(-1)} aria-label="Назад">
            <IoArrowBack size={26} />
          </button>
        </div>
        <div className="plCenter">
          <div className="plHint">Серия недоступна</div>
        </div>
      </div>
    );
  }

  const uri = quality === 'HD' ? episode.hd : episode.std;
  const src = videoUrl(uri || (quality === 'HD' ? episode.std : episode.hd) || '');

  return (
    <div className="plScreen" ref={wrapRef}>
      <div className="plVideoWrap">
        <video
          key={`${index}-${quality}`}
          ref={videoRef}
          className={stretch ? 'plVideo stretch' : 'plVideo'}
          src={src}
          autoPlay
          playsInline
          onLoadedMetadata={(e) => {
            // duration браузер знает сам (PLAN §8) — 0/Infinity не перетираем
            const d = e.currentTarget.duration;
            posRef.current = 0;
            if (d > 0 && Number.isFinite(d)) {
              durRef.current = d;
              setDuration(d);
            }
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            posRef.current = v.currentTime;
            setPosition(v.currentTime);
            saveProgress(v.currentTime, durRef.current);
          }}
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onCanPlay={() => setBuffering(false)}
          onEnded={() => {
            const d = durRef.current || duration;
            saveProgress(d, d, true);
            if (autoNext && hasNext) goToEpisode(index + 1);
          }}
          onError={() => {
            setSeekHint('Ошибка загрузки видео');
            setTimeout(() => setSeekHint(null), 2500);
          }}
        />

        {/* слой тапов + свайпа: одиночный тап — управление, двойной — ±10 сек */}
        <div
          className="plTapLayer"
          onPointerDown={onSurfacePointerDown}
          onPointerMove={onSurfacePointerMove}
          onPointerUp={onSurfacePointerUp}
          onPointerCancel={() => {
            gesture.current = { pointerId: null, startX: 0, startY: 0, swiping: false };
          }}
        />

        {buffering && (
          <div className="plBuffer">
            <div className="spinner" />
          </div>
        )}

        {/* подсказка перемотки */}
        {seekHint && (
          <div className="plSeekHint">
            <span>{seekHint}</span>
          </div>
        )}

        {/* подсказка поворота удалена (решение юзера 13.11.2026): на Android
            lock ложит телефон сам, на iOS видео просто остаётся в портрете */}

        {/* верхняя панель (fade + выезд сверху) */}
        <div className={controls ? 'plTop' : 'plTop plHidden'}>
          <button type="button" className="plIconBtn" onClick={() => navigate(-1)} aria-label="Назад">
            <IoArrowBack size={26} />
          </button>
          <span className="plTitle">
            {titleName(params.title ?? '')} · {episode.name}
          </span>
          <button
            type="button"
            className="plQualityBtn"
            onClick={() => setQuality((q) => (q === 'HD' ? 'SD' : 'HD'))}
          >
            {quality}
          </button>
        </div>

        {/* play/pause: 'video' — ОДНА строка в центре видео [prev][play][next]
            (порт нативного, фидбек юзера); 'both' — центральная кнопка; 'panel' —
            не рендерим, кнопки живут в нижней панели */}
        {controlsLayout === 'video' ? (
          <div className={controls ? 'plCenterRow' : 'plCenterRow plHidden'}>
            <button
              type="button"
              className={`plIconBtn ${!hasPrev ? 'plDisabled' : ''}`}
              onClick={() => goToEpisode(index - 1)}
              disabled={!hasPrev}
              aria-label="Предыдущая серия"
            >
              <IoPlaySkipBack size={24} />
            </button>
            <button
              type="button"
              className="plCenterRowPlay"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Играть' : 'Пауза'}
            >
              {paused ? <IoPlay size={38} /> : <IoPause size={38} />}
            </button>
            <button
              type="button"
              className={`plIconBtn ${!hasNext ? 'plDisabled' : ''}`}
              onClick={() => goToEpisode(index + 1)}
              disabled={!hasNext}
              aria-label="Следующая серия"
            >
              <IoPlaySkipForward size={24} />
            </button>
          </div>
        ) : controlsLayout === 'both' && (
          <div className={controls ? 'plCenterBtn' : 'plCenterBtn plHidden'}>
            <button
              type="button"
              className="plCenterBtnInner"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? 'Играть' : 'Пауза'}
            >
              {paused ? <IoPlay size={38} /> : <IoPause size={38} />}
            </button>
          </div>
        )}

        {/* нижний блок: серии + прогресс + время/кнопки (выезд снизу) */}
        <div className={controls ? 'plBottom' : 'plBottom plHidden'}>
          {/* серии: горизонтальная лента — видны ВСЕ серии.
              Выключается настройкой playerEpisodesStrip */}
          {showStrip && (
            <div className="plEpisodesStrip">
              {episodes.map((ep, idx) => (
                <button
                  type="button"
                  key={`${ep.name}-${idx}`}
                  className={`plChip ${idx === index ? 'plChipActive' : ''}`}
                  onClick={() => goToEpisode(idx)}
                >
                  {ep.name}
                </button>
              ))}
            </div>
          )}

          {/* прогресс: тап/драг по линии = перемотка (как в обычных плеерах) */}
          <div
            className="plScrubber"
            ref={trackRef}
            onPointerDown={onScrubPointerDown}
            onPointerMove={onScrubPointerMove}
            onPointerUp={onScrubPointerUp}
            onPointerCancel={() => setScrub(null)}
          >
            <div className="plTrack">
              <div className="plFill" style={{ width: progressPct }} />
              {scrub != null && <div className="plScrubDot" style={{ left: progressPct }} />}
            </div>
            {scrub != null && (
              <div className="plScrubBubble">
                {fmtTime(scrub)} / {fmtTime(duration)}
              </div>
            )}
          </div>

          <div className="plBottomBar">
            <span className="plTime">
              {fmtTime(position)} / {fmtTime(duration)}
            </span>
            {/* режим 'panel': play/pause + prev/next живут здесь, на панели */}
            {controlsLayout === 'panel' && (
              <div className="plPanelControls">
                <button
                  type="button"
                  className={`plIconBtn ${!hasPrev ? 'plDisabled' : ''}`}
                  onClick={() => goToEpisode(index - 1)}
                  disabled={!hasPrev}
                  aria-label="Предыдущая серия"
                >
                  <IoPlaySkipBack size={22} />
                </button>
                <button
                  type="button"
                  className="plIconBtn plPlayPause"
                  onClick={() => setPaused((p) => !p)}
                  aria-label={paused ? 'Играть' : 'Пауза'}
                >
                  {paused ? <IoPlay size={26} /> : <IoPause size={26} />}
                </button>
                <button
                  type="button"
                  className={`plIconBtn ${!hasNext ? 'plDisabled' : ''}`}
                  onClick={() => goToEpisode(index + 1)}
                  disabled={!hasNext}
                  aria-label="Следующая серия"
                >
                  <IoPlaySkipForward size={22} />
                </button>
              </div>
            )}
            <div className="plFsWrap">
              <button
                type="button"
                className="plIconBtn"
                onClick={() => void toggleFullscreen()}
                aria-label="Во весь экран"
              >
                {fullscreen ? <IoContract size={22} /> : <IoExpand size={22} />}
              </button>
            </div>
          </div>

          {/* группа prev/play/next — только 'both' (И там и там): в 'video'
              кнопки в центре видео (plCenterRow), в 'panel' — в нижнем баре */}
          {controlsLayout === 'both' && (
            <div className="plNavRow">
              <button
                type="button"
                className={`plIconBtn ${!hasPrev ? 'plDisabled' : ''}`}
                onClick={() => goToEpisode(index - 1)}
                disabled={!hasPrev}
                aria-label="Предыдущая серия"
              >
                <IoPlaySkipBack size={24} />
              </button>
              <button
                type="button"
                className="plIconBtn plPlayPause"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? 'Играть' : 'Пауза'}
              >
                {paused ? <IoPlay size={28} /> : <IoPause size={28} />}
              </button>
              <button
                type="button"
                className={`plIconBtn ${!hasNext ? 'plDisabled' : ''}`}
                onClick={() => goToEpisode(index + 1)}
                disabled={!hasNext}
                aria-label="Следующая серия"
              >
                <IoPlaySkipForward size={24} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
