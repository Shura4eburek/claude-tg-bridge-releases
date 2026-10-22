// Мелочи мини-аппы v2: экранирование, время, размеры. Без зависимостей — модули
// грузятся напрямую <script type="module">, сборки нет.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// В списках — относительное время («сейчас», «2 мин», «вчера»), в ленте — «14:02»
// (README дизайн-системы, «Содержание и тон»).
export function ago(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'сейчас';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч`;
  return h < 48 ? 'вчера' : `${Math.round(h / 24)} дн`;
}

export function clock(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Таймеры — «02:14», час и больше — «1:02:14».
export function timer(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Числа — с запятой: «1,4 МБ».
export function size(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1).replace('.', ',') : Math.round(kb)} КБ`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} МБ`;
}

// base64url без «=» — так мост пишет ключи и подписи (Buffer#toString('base64url')).
export function b64url(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(text) {
  const s = atob(String(text).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const icon = (name, cls = '', label = '') =>
  `<i data-i="${esc(name)}"${cls ? ` class="${esc(cls)}"` : ''}${label ? ` aria-label="${esc(label)}"` : ''}></i>`;
