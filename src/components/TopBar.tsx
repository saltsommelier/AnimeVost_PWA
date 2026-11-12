import { IoSearch, IoSettingsOutline } from 'react-icons/io5';
import { useNavigate } from 'react-router-dom';
import './components.css';

/**
 * Верхняя панель вкладок — порт нативного src/components/TopBar.js:
 * заголовок слева, кнопки поиска и настроек справа. На всех четырёх вкладках.
 */
export default function TopBar({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div className="topbar">
      <h1 className="topbarTitle">{title}</h1>
      <div className="topbarActions">
        <IconButton
          label="Поиск"
          onClick={() => navigate('/search')}
          accessibilityLabel="Поиск"
        >
          <IoSearch size={24} />
        </IconButton>
        <IconButton
          label="Настройки"
          onClick={() => navigate('/settings')}
          accessibilityLabel="Настройки"
        >
          <IoSettingsOutline size={24} />
        </IconButton>
      </div>
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  accessibilityLabel,
  children,
}: {
  label: string;
  onClick: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="iconButton"
      onClick={onClick}
      aria-label={accessibilityLabel}
      title={label}
    >
      {children}
    </button>
  );
}
