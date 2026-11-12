import { useLocation, useNavigate } from 'react-router-dom';
import ScreenHeader from '../components/ScreenHeader';
import type { PlayerRouteState } from './TitleScreen';
import './screens.css';

/**
 * Плеер — этап 4 (PLAN §10). Пока заглушка: показывает параметры,
 * с которыми нативный переход открывал бы PlayerScreen
 * (id/тайтл/серии/индекс), чтобы этап 3 был кликабелен до конца.
 */
export default function PlayerStub() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? null) as PlayerRouteState | null;

  if (!state) {
    return (
      <div className="screen">
        <ScreenHeader title="Плеер" />
        <div className="center">
          <div className="empty">Открывается из тайтла кнопкой «Смотреть»</div>
          <button type="button" className="retry" onClick={() => navigate(-1)}>
            Назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader title="Плеер" />
      <div className="center">
        <div className="empty">
          Этап 4 (PLAN §10): {state.title.split(' /')[0]} · серия{' '}
          {state.episodes[state.index]?.name ?? '—'} из {state.episodes.length}
        </div>
        <button type="button" className="retry" onClick={() => navigate(-1)}>
          Назад
        </button>
      </div>
    </div>
  );
}
