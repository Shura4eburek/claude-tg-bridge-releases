// Как поставить мост на экран «Домой» в этом браузере (016): страница сама себя установить не
// может (кроме Chrome на Android — там кнопка «Установить»), а кнопка «Поделиться» или меню у
// каждого браузера на своём месте и пункты называются на языке системы. Шаги — словами
// мини-аппы (по-русски), названия пунктов — как их видит человек в меню браузера.

/** @typedef {'share' | 'page' | 'dots-h' | 'dots-v' | 'menu' | 'plus' | 'app'} GuideIcon */
/** @typedef {'bottom-center' | 'bottom-addr' | 'bottom-right' | 'top-right' | 'top-share' | 'none'} Arrow */
/** @typedef {{ icon: GuideIcon, html: string }} GuideStep */
/** @typedef {{ os: 'ios' | 'android' | 'other', browser: string, arrow: Arrow, steps: GuideStep[] }} Guide */

/** Названия пунктов меню на языке системы: ru, uk, иначе en. */
const NAMES = {
  ru: { home: 'На экран „Домой“', share: 'Поделиться', install: 'Установить приложение', installFx: 'Установить', samsungAdd: 'Добавить страницу на', samsungHome: 'Главный экран', yandex: 'Добавить ярлык', addHome: 'Добавить на главный экран' },
  uk: { home: 'На початковий екран', share: 'Поширити', install: 'Установити додаток', installFx: 'Установити', samsungAdd: 'Додати сторінку до', samsungHome: 'Головний екран', yandex: 'Додати ярлик', addHome: 'Додати на головний екран' },
  en: { home: 'Add to Home Screen', share: 'Share', install: 'Install app', installFx: 'Install', samsungAdd: 'Add page to', samsungHome: 'Home screen', yandex: 'Add shortcut', addHome: 'Add to Home screen' },
};

export function langOf(language) {
  const l = String(language ?? '').toLowerCase().slice(0, 2);
  return l === 'ru' || l === 'uk' ? l : 'en';
}

/**
 * Система и браузер по userAgent. Порядок проверок важен: у всех браузеров iOS в UA есть «Safari».
 * iPad в Safari притворяется Mac — его выдаёт сенсорный экран (`touch` = maxTouchPoints).
 * Версия Safari — из «Version/N»: с iOS 26 «OS 18_6» в UA заморожена.
 */
export function detect(ua, touch = 0, ios = false) {
  const s = String(ua ?? '');
  if (ios || /iPhone|iPad|iPod/.test(s) || (/Macintosh/.test(s) && touch > 1)) {
    const ver = Number(/Version\/(\d+)/.exec(s)?.[1] ?? /OS (\d+)_/.exec(s)?.[1] ?? 0);
    const browser = /CriOS/.test(s) ? 'chrome' : /FxiOS/.test(s) ? 'firefox' : /EdgiOS/.test(s) ? 'edge' : /YaBrowser/.test(s) ? 'yandex' : /OPT\//.test(s) ? 'opera' : 'safari';
    return { os: 'ios', browser, ver };
  }
  if (/Android/.test(s)) {
    const browser = /SamsungBrowser/.test(s) ? 'samsung' : /Firefox/.test(s) ? 'firefox' : /YaBrowser/.test(s) ? 'yandex' : /EdgA/.test(s) ? 'edge' : /OPR\//.test(s) ? 'opera' : 'chrome';
    return { os: 'android', browser, ver: 0 };
  }
  return { os: 'other', browser: 'other', ver: 0 };
}

const b = (t) => `<b>«${t}»</b>`;

/**
 * Шаги установки для браузера. `canPrompt` — браузер дал событие установки (Chrome на Android):
 * тогда хватает кнопки «Установить» на странице, шаги — запасной путь. `ios` — страница уже знает,
 * что это iOS, даже если UA молчит; `touch` — maxTouchPoints (iPad).
 * @returns {Guide}
 */
export function guideFor(ua, language, { canPrompt = false, touch = 0, ios = false } = {}) {
  const { os, browser, ver } = detect(ua, touch, ios);
  const n = NAMES[langOf(language)];
  const home = { icon: 'plus', html: `Выберите ${b(n.home)} — если не видно, пролистайте меню вниз` };
  const open = { icon: 'app', html: 'Откройте мост с новой иконки на экране «Домой»' };
  if (os === 'ios') {
    // Chrome: «Поделиться» внутри адресной строки справа, правее — ещё «•••» (проверено на iPhone, 016).
    if (browser === 'chrome') return { os, browser, arrow: 'top-share', steps: [{ icon: 'share', html: `Нажмите ${b(n.share)} в адресной строке сверху справа` }, home, open] };
    if (browser === 'firefox') return { os, browser, arrow: 'bottom-right', steps: [{ icon: 'menu', html: `Нажмите меню ≡ внизу справа → ${b(n.share)}` }, home, open] };
    if (browser === 'edge') return { os, browser, arrow: 'bottom-center', steps: [{ icon: 'dots-h', html: `Нажмите ••• внизу по центру → ${b(n.share)}` }, home, open] };
    if (browser === 'yandex' || browser === 'opera') return { os, browser, arrow: 'bottom-right', steps: [{ icon: 'menu', html: `Откройте меню браузера внизу → ${b(n.share)}` }, home, open] };
    // Safari 26 убрал «Поделиться» в меню страницы — значок слева в адресной строке (проверено
    // на iPhone, 016); до 26 — кнопка внизу по центру.
    if (ver >= 26) return { os, browser, arrow: 'bottom-addr', steps: [{ icon: 'page', html: `Нажмите значок слева в адресной строке внизу → ${b(n.share)}` }, home, open] };
    return { os, browser, arrow: 'bottom-center', steps: [{ icon: 'share', html: `Нажмите ${b(n.share)} внизу по центру` }, home, open] };
  }
  if (os === 'android') {
    if (browser === 'samsung') return { os, browser, arrow: 'bottom-right', steps: [{ icon: 'menu', html: `Нажмите меню ≡ внизу справа → ${b(n.samsungAdd)}` }, { icon: 'plus', html: `Выберите ${b(n.samsungHome)}` }, open] };
    if (browser === 'firefox') return { os, browser, arrow: 'top-right', steps: [{ icon: 'dots-v', html: 'Нажмите меню ⋮ (сверху или снизу справа)' }, { icon: 'plus', html: `Выберите ${b(n.installFx)}` }, open] };
    if (browser === 'yandex') return { os, browser, arrow: 'bottom-right', steps: [{ icon: 'dots-v', html: 'Нажмите меню ⋮ внизу справа' }, { icon: 'plus', html: `Выберите ${b(n.yandex)}` }, open] };
    if (browser === 'edge' || browser === 'opera') return { os, browser, arrow: 'bottom-right', steps: [{ icon: 'menu', html: 'Откройте меню браузера' }, { icon: 'plus', html: `Выберите ${b(n.addHome)}` }, open] };
    return { os, browser, arrow: canPrompt ? 'none' : 'top-right', steps: [{ icon: 'dots-v', html: 'Нажмите меню ⋮ сверху справа' }, { icon: 'plus', html: `Выберите ${b(n.install)}` }, open] };
  }
  return { os, browser, arrow: 'none', steps: [{ icon: 'menu', html: 'Откройте меню браузера' }, { icon: 'plus', html: `Выберите ${b(n.install)}` }, open] };
}

// Иконки — как выглядят кнопки самих браузеров (квадрат со стрелкой iOS, три точки, ≡), а не
// иконки мини-аппы: человек ищет глазами именно их.
const SVG = {
  share: '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M6 11v9h12v-9"/>',
  page: '<rect x="3" y="5" width="8" height="14" rx="2"/><path d="M14 8h7M14 12h7M14 16h7"/>',
  'dots-h': '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  'dots-v': '<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
  app: '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M10 18h4"/>',
};

export function guideIcon(name) {
  return `<svg class="tb-gi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[name] ?? ''}</svg>`;
}
