// Третий источник безопасных зон (рядом с env() и --tg-safe-area-*): `?__safe=t,r,b,l`.
//
// Зачем: на десктопе env(safe-area-inset-*) всегда 0, и проверить отступы под вырез и полоску
// «домой» можно было только на живом телефоне. Стенд телефона (dev/stand.html) грузит аппу в
// iframe с `?__safe=…` — отступы ложатся в --sa-ov-* на <html>, а app.css берёт большее из трёх.
// В обычной работе параметра нет, и override ничего не делает.
//
// Формат: четыре числа в CSS-пикселях через запятую, порядок как в CSS (top, right, bottom,
// left). Значения клампятся в 0..120; любой мусор означает «не переопределять».

const SIDES = ['t', 'r', 'b', 'l'];

/**
 * Разбор `?__safe=` из location.search.
 * @param {string} search
 * @returns {[number, number, number, number] | null}
 */
export function parseSafe(search) {
  let raw;
  try { raw = new URLSearchParams(search).get('__safe'); } catch { return null; }
  if (!raw) return null;
  const parts = raw.split(',');
  if (parts.length !== 4) return null;
  const px = [];
  for (const part of parts) {
    // Number, а не parseFloat: «12abc» — мусор, а не 12.
    const n = part.trim() === '' ? NaN : Number(part);
    if (!Number.isFinite(n)) return null;
    px.push(Math.min(120, Math.max(0, n)));
  }
  return /** @type {[number, number, number, number]} */ (px);
}

/**
 * Ставит --sa-ov-* на <html>. Тот же код живёт inline в <head> index.html (до первой
 * отрисовки, иначе кадр мигнёт без отступов); тест следит, чтобы они вели себя одинаково.
 * @param {string} search
 * @param {{ style: { setProperty(name: string, value: string): void } }} root
 */
export function applySafe(search, root) {
  const px = parseSafe(search);
  if (!px) return false;
  SIDES.forEach((s, i) => root.style.setProperty(`--sa-ov-${s}`, `${px[i]}px`));
  return true;
}
