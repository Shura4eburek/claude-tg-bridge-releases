// Копирование в буфер обмена. Отдельным модулем, потому что штатного способа
// мало: в WebView Telegram на iOS `navigator.clipboard.writeText` либо
// отсутствует, либо молча отказывает — кнопка «копировать» у блока кода там не
// работала вовсе, и текст приходилось выделять пальцем.
//
// `document.execCommand('copy')` объявлен устаревшим, но именно он работает
// там, где не работает новый способ, и пробуем мы его ПЕРВЫМ.
//
// Порядок здесь — вся суть модуля. На iOS право писать в буфер живёт только
// внутри обработчика жеста и теряется на первом же `await`: попытка сперва
// дождаться отказа `navigator.clipboard`, а потом откатиться к execCommand,
// не работает — к моменту отката жеста уже нет. Поэтому синхронный способ
// идёт первым, а штатный остаётся запасным (проверено живьём 2026-09-07:
// с обратным порядком кнопка на iOS не копировала вовсе).

// Поле должно быть в разметке и видимым для движка — со `display:none`
// выделения не будет. Размер в пиксель и нулевая прозрачность прячут его от
// глаза; `font-size: 16px` не даёт iOS зумить страницу под «поле ввода».
//
// Выделение разрешаем явно и через `!important`: клиент Telegram на iOS
// подсовывает странице свой стиль, гасящий выделение по всей разметке, и
// временное поле наследовало его — выделение не создавалось, а execCommand
// честно возвращал false. Это же правило объясняет, почему в ленте не
// выделялся текст руками (см. #messages в style.css).
const HIDDEN = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;'
  + 'user-select:text !important;-webkit-user-select:text !important;';

function legacyCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  // Именно редактируемое и не readonly: из readonly-поля iOS копировать не
  // даёт — выделение в нём не создаётся, и execCommand возвращает false.
  area.readOnly = false;
  area.contentEditable = 'true';
  // setAttribute, а не style.cssText: свойства с вендорным префиксом движок
  // при разборе cssText отбрасывает, а нужны они именно здесь.
  area.setAttribute('style', HIDDEN);
  document.body.appendChild(area);
  try {
    // Выделяем двумя способами сразу: setSelectionRange хватает настольным
    // браузерам, Range с выделением документа — тому же iOS.
    const range = document.createRange();
    range.selectNodeContents(area);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    // Убираем всегда: иначе на каждой копии в разметке оседает поле.
    area.remove();
  }
}

/** @param {string} text */
export async function copyText(text) {
  const s = String(text ?? '');
  // Пустой текст не копируем: кнопка отчиталась бы об успехе, не сделав ничего.
  if (!s) return false;
  // Синхронно и до любого await — пока жест ещё «наш».
  if (typeof document.execCommand === 'function' && legacyCopy(s)) return true;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(s);
      return true;
    }
  } catch {
    // Отказ буфера — не ошибка, а обычное состояние iOS-клиента.
  }
  return false;
}
