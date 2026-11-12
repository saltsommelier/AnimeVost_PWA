/**
 * Картинки (PLAN §4). API отдаёт urlImagePreview с хоста static.openni.ru,
 * чей https-сертификат истёк 22.10.2026 (проверено curl 12.11.2026:
 * SEC_E_CERT_EXPIRED). В браузере mixed content запрещён — http-картинки
 * с https-страницы не загрузить. Поэтому используем ЛОКАЛЬНЫЕ КОПИИ
 * сайта-источника: https://animevost.org/uploads/posts/… (путь совпадает
 * 1:1, сертификат валиден, копии есть вплоть до 2020 года — проверено
 * 12.11.2026 на тайтлах 2020/2026 гг.).
 *
 * ВЕСЬ хостинг картинок правится ТОЛЬКО здесь — одно место (правило PLAN §11).
 */

/** url превью API → url с живым https-хостом. */
export function imageUrl(url: string | null | undefined): string {
  if (typeof url !== 'string' || !url) return '';
  return url.replace(/^https?:\/\/static\.openni\.ru/i, 'https://animevost.org');
}
