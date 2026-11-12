/**
 * Модель данных API (PLAN §5). Поля дополняются по мере портирования экранов.
 */

/** Тайтл из лент (`last`, `search`, `info`). */
export interface Title {
  id: number;
  title: string;
  urlImagePreview?: string | null;
  description?: string | null;
  rating?: number | null;
  votes?: number | null;
  genre?: string | null;
  year?: number | string | null;
  timer?: number | null;
  /** Только в ответе getInfo. */
  type?: string | null;
  director?: string | null;
  /** Полоска «досмотрено N%» — только для карточек Истории (0…1). */
  progress?: number | null;
}

/** Серия из `playlist`. */
export interface Episode {
  name: string;
  hd?: string | null;
  std?: string | null;
  preview?: string | null;
}

/** Справочники жанров/годов. */
export interface GenresAndYears {
  years: number[];
  genres: string[];
}
