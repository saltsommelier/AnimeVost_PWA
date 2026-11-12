import { useCallback, useRef } from 'react';

/**
 * Долгое нажатие (350 мс) — веб-эквивалент RN Pressable onLongPress.
 * На ПК долгих нажатий нет — то же действие вызывает правый клик
 * (onContextMenu), что и принято в веб-интерфейсах.
 */
export function useLongPress(onLongPress: () => void, delayMs = 350) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current != null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const handlers = {
    onPointerDown: useCallback(() => {
      fired.current = false;
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, delayMs);
    }, [clear, delayMs, onLongPress]),
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onContextMenu: useCallback(
      (e: { preventDefault(): void }) => {
        e.preventDefault();
        clear();
        fired.current = true;
        onLongPress();
      },
      [clear, onLongPress],
    ),
  };

  /** Был ли только что вызван долгий тап (чтобы подавить follow-up click). */
  const consumeFired = useCallback(() => {
    const was = fired.current;
    fired.current = false;
    return was;
  }, []);

  return { handlers, consumeFired };
}
