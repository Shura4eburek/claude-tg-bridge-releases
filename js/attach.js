// Разбор служебной строки вложения. Мост инжектит отправленный файл строкой с
// путём и просьбой прочитать его — Claude она нужна, а в ленте на месте
// отправленного фото стоял этот текст вместо самой картинки.
//
// Отдельным модулем, а не в render.js: регулярки здесь длинные и с
// экранированием, и держать их рядом с разметкой значит каждый раз выискивать
// их среди шаблонных строк.
const INBOX = '.claude-tg-inbox';

// Одно вложение: «[Вложение из Telegram: <путь> — прочитай файл, …]». Источник бывает и
// окном Shirabe (src/media.ts attachmentPrompt).
const ONE = new RegExp('^\\[Вложение из (?:Telegram|Shirabe): (' + INBOX + '/[^\\]]+?) — прочитай файл[^\\]]*\\]');
// Пачка: заголовок со счётчиком, дальше строки «- <путь>».
const MANY = /^\[Вложения из (?:Telegram|Shirabe) \((\d+)\)[^\]]*\]/;
const ITEM = new RegExp('^- (' + INBOX + '/.+)$');

export function inboxAttachments(text) {
  const raw = String(text ?? '');
  const one = ONE.exec(raw);
  // Подпись пишется отдельным абзацем после списка — она и есть то, что
  // человек написал руками, и потерять её нельзя.
  if (one) return { files: [one[1].trim()], caption: raw.slice(one[0].length).trim() };
  if (!MANY.test(raw)) return null;
  const lines = raw.split('\n');
  const files = [];
  let i = 1;
  for (; i < lines.length; i++) {
    const m = ITEM.exec(lines[i].trim());
    if (!m) break;
    files.push(m[1].trim());
  }
  if (!files.length) return null;
  return { files, caption: lines.slice(i).join('\n').trim() };
}

// Обратное направление: файл, который Claude отправил в ленту нарочно. В
// транскрипте это строка `[tg-attach: путь]` в его же ответе — своего хранилища
// сообщений у моста нет, а текст ответа лежит в транскрипте и переживает и
// закрытую аппу, и перезапуск моста.
//
// Маркер узнаётся только целой строкой: в ответах Claude квадратные скобки
// стоят через одну, и разбор внутри фразы резал бы обычный текст.
const OUT = /^\[tg-attach:([^\]]*)\]$/;

// Путь с `..` не показываем вовсе. Настоящую границу держит сервер
// (resolveInsideCwd в src/server.ts), но плитка на файл, который всё равно
// отдадут 404, — это ссылка в никуда прямо в ленте.
const UP = /(^|[\\/])\.\.([\\/]|$)/;

export function outboxAttachments(text) {
  const lines = String(text ?? '').split('\n');
  const files = [];
  const rest = [];
  for (const line of lines) {
    const m = OUT.exec(line.trim());
    const path = m ? m[1].trim() : '';
    if (m && path && !UP.test(path)) files.push(path);
    // Строку с негодным путём тоже съедаем: показать её человеку сырой значит
    // показать служебный маркер, а он ему ни о чём не говорит.
    else if (!m) rest.push(line);
  }
  if (!files.length) return null;
  return { files, caption: rest.join('\n').trim() };
}

// Картинка ли это — по расширению. Всё остальное показываем ссылкой, как и
// раньше: рисовать <img> на pdf или архив бессмысленно.
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|heic)$/i;

export function isImagePath(path) {
  return IMAGE_EXT.test(String(path ?? '').trim());
}

// 014: хост Shirabe файлов не хранит — картинка уходит модели сразу, а в ленте после
// текста остаются заметки: «[файл: имя]» на файл и «[изображение]» на картинки
// (research R5, проверено вживую). Узнаём их только хвостом сообщения и целыми строками.
const NOTE = /^\[(?:файл: ([^\]]+)|изображение)\]$/;

export function hostNotes(text) {
  const blocks = String(text ?? '').split(/\n{2,}/);
  const chips = [];
  while (blocks.length) {
    const m = NOTE.exec(blocks[blocks.length - 1].trim());
    if (!m) break;
    chips.unshift(m[1] ? { kind: 'file', name: m[1].trim() } : { kind: 'image', name: 'изображение' });
    blocks.pop();
  }
  if (!chips.length) return null;
  return { caption: blocks.join('\n\n').trim(), chips };
}

// Картинка прямо в ответе: ![подпись](data:image/…;base64,…). Только растровые image/* —
// data:text/html или svg в превью не пойдут ни при каких условиях.
const DATA_IMG = /!\[([^\]\n]*)\]\((data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+)\)/g;

export function dataImages(text) {
  const images = [];
  const rest = String(text ?? '').replace(DATA_IMG, (_, name, src) => { images.push({ name: name || 'картинка', src }); return ''; });
  if (!images.length) return null;
  return { images, text: rest.replace(/[ \t]+$/gm, '') };
}
