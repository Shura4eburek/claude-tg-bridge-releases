// Разметка ответа агента (FR-001): таблицы, списки, заголовки, цитаты, код, ссылки.
// Свой разбор, без библиотек: мини-аппа грузится без сборки. Текст агента приходит из
// чужого репозитория — всё экранируется ДО разметки, теги появляются только наши.

import { esc } from './util.js?v=238';

// Блок длиннее — свёрнут: 40 строк лога на телефоне закрывают весь ответ.
const FOLD_LINES = 12;

const FENCE = /^\s*```\s*([^`\s]*)\s*$/;
// Без ленивого хвоста «\s*#*\s*$»: на «# a» + тысячи пробелов он перебирал их квадратично
// (30 с на строку, ревью 014). Хвостовые # снимает headText.
const HEAD = /^(#{1,3})[ \t]+(\S.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const NUM = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/**
 * @param {string} text
 * @param {{ key?: string, expanded?: Set<string> }} [opts] key — id события: по нему
 *   помнится, какие блоки кода развернули, иначе перерисовка ленты сворачивала бы их снова.
 */
export function md(text, opts = {}) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let codeNo = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // закрывающий ``` (или конец ответа — стрим ещё идёт)
      out.push(codeBlock(body.join('\n'), fence[1], `${opts.key ?? ''}:${codeNo++}`, opts.expanded));
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const head = HEAD.exec(line);
    if (head) { out.push(`<div class="tb-md-h${head[1].length}">${inline(headText(head[2]))}</div>`); i++; continue; }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const rows = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(lines[i++]);
      out.push(table(rows));
      continue;
    }
    if (QUOTE.test(line)) {
      const q = [];
      while (i < lines.length && QUOTE.test(lines[i])) q.push(QUOTE.exec(lines[i++])[1]);
      out.push(`<blockquote class="tb-md-q">${q.map(inline).join('<br>')}</blockquote>`);
      continue;
    }
    if (BULLET.test(line) || NUM.test(line)) {
      const items = [];
      while (i < lines.length && (BULLET.test(lines[i]) || NUM.test(lines[i]))) items.push(lines[i++]);
      out.push(list(items));
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !HEAD.test(lines[i]) && !QUOTE.test(lines[i]) && !BULLET.test(lines[i]) && !NUM.test(lines[i])
      && !(lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]))) para.push(lines[i++]);
    out.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}

// «## Итог ##» → «Итог»: закрывающие # срезаем циклом, а не регуляркой.
function headText(t) {
  let s = t.trimEnd();
  while (s.endsWith('#')) s = s.slice(0, -1);
  return s.trimEnd() || t.trim();
}

function codeBlock(code, lang, key, expanded) {
  const n = code.split('\n').length;
  const fold = n > FOLD_LINES && !expanded?.has(key);
  return `<div class="tb-cb${fold ? ' is-fold' : ''}"><div class="tb-cb-h"><span>${esc(lang || 'код')}</span>`
    + '<button class="tb-cb-copy" data-act="copy-code">Копировать</button></div>'
    + `<pre class="tb-code">${esc(code)}</pre>`
    + (fold ? `<button class="tb-cb-more" data-act="expand" data-key="${esc(key)}">Показать целиком · ${n} строк</button>` : '')
    + '</div>';
}

function cells(row) {
  const s = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  return s.split('|').map((c) => c.trim());
}

function table(rows) {
  const head = cells(rows[0]);
  const align = cells(rows[1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
  const st = (k) => (align[k] ? ` style="text-align:${align[k]}"` : '');
  const body = rows.slice(2).map((r) => {
    const c = cells(r);
    // Недостающие ячейки — пустые, лишние — отбрасываем: строка не теряется целиком.
    return `<tr>${head.map((_, k) => `<td${st(k)}>${inline(c[k] ?? '')}</td>`).join('')}</tr>`;
  }).join('');
  return `<div class="tb-md-table"><table><thead><tr>${head.map((h, k) => `<th${st(k)}>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

// Вложенность — один уровень: отступ ≥ 2 пробелов уводит пункт во вложенный список.
function list(items) {
  const parse = (l) => {
    const b = BULLET.exec(l);
    if (b) return { indent: b[1].length, ordered: false, text: b[2] };
    const n = NUM.exec(l);
    return { indent: n[1].length, ordered: true, start: Number(n[2]), text: n[3] };
  };
  const parsed = items.map(parse);
  const base = parsed[0].indent;
  const tag = (p) => (p.ordered ? `<ol class="tb-md-l"${p.start !== 1 ? ` start="${p.start}"` : ''}>` : '<ul class="tb-md-l">');
  const end = (p) => (p.ordered ? '</ol>' : '</ul>');
  let html = tag(parsed[0]);
  let k = 0;
  while (k < parsed.length) {
    const p = parsed[k++];
    let li = `<li>${inline(p.text)}`;
    if (k < parsed.length && parsed[k].indent >= base + 2) {
      const first = parsed[k];
      li += tag(first);
      while (k < parsed.length && parsed[k].indent >= base + 2) li += `<li>${inline(parsed[k++].text)}</li>`;
      li += end(first);
    }
    html += `${li}</li>`;
  }
  return html + end(parsed[0]);
}

const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

// Строчное: сначала вынимаем `код` и ссылки в заглушки, экранируем остальное, потом
// жирный и курсив — так звёздочки внутри кода и адреса не превращаются в разметку.
function inline(src) {
  const slots = [];
  // Заглушки — символы частной зоны Unicode; из самого текста их вычищаем, иначе
  // ответ мог бы сослаться на чужую заглушку.
  const put = (html) => `${slots.push(html) - 1}`;
  let s = String(src ?? '').replace(/[]/g, '')
    .replace(/`([^`\n]+)`/g, (_, c) => put(`<code>${esc(c)}</code>`))
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, label, url) => (SAFE_URL.test(url)
      ? put(`<a class="tb-link" href="${esc(url)}" data-act="link" data-url="${esc(url)}" rel="noopener">${esc(label)}</a>`)
      : m));
  s = esc(s)
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    // Курсив — только у слова целиком: «2 * 3 * 4» и my_long_name остаются как есть.
    .replace(/(^|[\s(])\*([^\s*][^*\n]*?)\*(?=$|[\s.,;:!?)])/g, '$1<i>$2</i>')
    .replace(/(^|[\s(])_([^\s_][^_\n]*?)_(?=$|[\s.,;:!?)])/g, '$1<i>$2</i>');
  // Заглушка бывает внутри другой (код в подписи ссылки) — подставляем, пока они есть.
  const SLOT = /(\d+)/g;
  for (let k = 0; k < 4 && SLOT.test(s); k++) s = s.replace(SLOT, (_, n) => slots[Number(n)]);
  return s;
}
