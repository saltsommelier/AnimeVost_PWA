import { useCallback, useEffect, useState } from 'react';
import { IoArrowBack, IoCheckmark, IoCloseCircle } from 'react-icons/io5';
import { useNavigate } from 'react-router-dom';
import { getGenres, searchByGenre, searchByYear, searchByName } from '../api/anime';
import type { Title } from '../api/types';
import AnimeCard from '../components/AnimeCard';
import { Spinner } from './HomeScreen';
import './screens.css';

/**
 * Поиск — порт нативного src/screens/SearchScreen.js: строка ввода + лента
 * результатов (та же карточка) + фильтры по жанру и году (данные из
 * эндпоинта `genres`).
 *
 * Нюанс API: один запрос принимает ТОЛЬКО одно из name / gen / year.
 * Приоритет: текст запроса > жанр > год. Активные фильтры сбрасываются
 * тапом по чипу. Дебаунс ввода — 500 мс.
 */
export default function SearchScreen() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [years, setYears] = useState<number[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [genre, setGenre] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [picker, setPicker] = useState<'genre' | 'year' | null>(null);
  const [items, setItems] = useState<Title[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // жанры/годы — один раз при открытии экрана
  useEffect(() => {
    let cancelled = false;
    getGenres()
      .then(({ years: y, genres: g }) => {
        if (!cancelled) {
          setYears(y);
          setGenres(g);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // дебаунс ввода
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 500);
    return () => clearTimeout(t);
  }, [query]);

  const runSearch = useCallback(async () => {
    const q = debounced.trim();
    let request: (() => Promise<{ data: Title[]; count: number | null }>) | null = null;
    if (q) request = () => searchByName(q);
    else if (genre) request = () => searchByGenre(genre);
    else if (year) request = () => searchByYear(year);

    if (!request) {
      setItems([]);
      setCount(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, count: total } = await request();
      setItems(data ?? []);
      setCount(total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [debounced, genre, year]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  const searching = query.trim() !== debounced.trim();

  return (
    <div className="screen">
      <div className="searchHeader">
        <button
          type="button"
          className="iconButton back"
          onClick={() => navigate(-1)}
          aria-label="Назад"
          title="Назад"
        >
          <IoArrowBack size={26} />
        </button>
        <input
          className="searchInput"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Название аниме…"
          autoFocus
          enterKeyHint="search"
        />
      </div>

      <div className="filters">
        <FilterChip
          label={genre ?? 'Жанр'}
          active={Boolean(genre)}
          onPress={() => setPicker('genre')}
        />
        <FilterChip
          label={year ? String(year) : 'Год'}
          active={Boolean(year)}
          onPress={() => setPicker('year')}
        />
        {(genre || year) && (
          <button
            type="button"
            className="clearFilters"
            onClick={() => {
              setGenre(null);
              setYear(null);
            }}
            aria-label="Сбросить фильтры"
            title="Сбросить фильтры"
          >
            <IoCloseCircle size={22} />
          </button>
        )}
      </div>

      {loading || searching ? (
        <div className="center">
          <Spinner />
        </div>
      ) : error ? (
        <div className="center">
          <div className="empty">{error}</div>
        </div>
      ) : items.length === 0 ? (
        <div className="center">
          <div className="empty">
            {debounced.trim() || genre || year
              ? 'Ничего не найдено'
              : 'Введите название или выберите фильтр'}
          </div>
        </div>
      ) : (
        <>
          {count != null && !debounced.trim() && (
            <div className="resultCount">
              {/* у search state.count всегда 0 — показываем фактическое число;
                  API отдаёт фильтры (жанр/год) с капом ~50 тайтлов */}
              Найдено: {count > 0 ? count : items.length}
            </div>
          )}
          <div className="feedList">
            {items.map((item) => (
              <AnimeCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      <PickerModal
        visible={picker === 'genre'}
        title="Жанр"
        options={genres}
        selected={genre}
        onSelect={(v) => {
          setGenre(v);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <PickerModal
        visible={picker === 'year'}
        title="Год"
        options={years.map(String)}
        selected={year != null ? String(year) : null}
        onSelect={(v) => {
          setYear(Number(v));
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className={`chip filterChip ${active ? 'chipActive' : ''}`}
      onClick={onPress}
    >
      {label}
    </button>
  );
}

function PickerModal({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) return null;
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modalCard pickerModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalTitle">{title}</div>
        <div className="pickerList">
          {options.map((option, idx) => (
            <button
              type="button"
              key={option + idx}
              className={`option ${option === selected ? 'optionActive' : ''}`}
              onClick={() => onSelect(option)}
            >
              <span>{option}</span>
              {option === selected && <IoCheckmark size={20} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
