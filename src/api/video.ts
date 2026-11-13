/**
 * Адреса видео (PLAN §4, §11). Ссылки серий из `playlist` (поля hd/std)
 * приходят с хостом video.animetop.info по протоколу http — на https-странице
 * PWA браузер блокирует такой mixed content. https у хоста живой
 * (проверено 12.11.2026: 206 Partial Content) — поднимаем схему.
 *
 * ВЕСЬ хостинг видео правится ТОЛЬКО здесь (правило PLAN §11).
 */
export function videoUrl(url: string | null | undefined): string {
  if (typeof url !== 'string' || !url) return '';
  return url.replace(/^http:\/\/video\.animetop\.info/i, 'https://video.animetop.info');
}
