import { IoArrowBack } from 'react-icons/io5';
import { useNavigate } from 'react-router-dom';
import './components.css';

/**
 * Шапка over-tab экранов (поиск, тайтл, настройки) — порт нативного
 * src/components/ScreenHeader.js: назад + заголовок.
 */
export default function ScreenHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div className="screenHeader">
      <button
        type="button"
        className="iconButton back"
        onClick={() => navigate(-1)}
        aria-label="Назад"
        title="Назад"
      >
        <IoArrowBack size={26} />
      </button>
      <h1 className="screenHeaderTitle">{title}</h1>
    </div>
  );
}
