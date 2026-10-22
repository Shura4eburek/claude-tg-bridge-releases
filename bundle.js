/* @ds-bundle: {"format":4,"namespace":"TgBridge","components":[{"name":"Icons"},{"name":"StatusDot"},{"name":"LimitBadge"},{"name":"Button"},{"name":"MachineTabs"},{"name":"SessionCard"},{"name":"Feed"},{"name":"MiniConsole"},{"name":"Subagents"},{"name":"QuestionCard"},{"name":"ApprovalCard"},{"name":"StopButton"},{"name":"Queue"},{"name":"Composer"},{"name":"Attachments"},{"name":"Workflow"},{"name":"Diff"},{"name":"Sheet"},{"name":"SettingRow"},{"name":"EmptyState"}]} */
(function () {
  // Иконки — набор Shirabe (16×16, линия 1,2, currentColor) плюс несколько для телефона. В 20px штрих выглядит как 1,5px.
  var P = {
    folder: '<path d="M2 4.5h4l1.5 1.5H14v6.5H2z"/>',
    branch: '<circle cx="5" cy="3.5" r="1.5"/><circle cx="5" cy="12.5" r="1.5"/><circle cx="11" cy="5" r="1.5"/><path d="M5 5v6M11 6.5c0 2.6-6 2-6 4.5"/>',
    "chev-down": '<path d="M4.5 6.5 8 10l3.5-3.5"/>',
    "chev-right": '<path d="M6.5 4.5 10 8l-3.5 3.5"/>',
    plus: '<path d="M8 3.5v9M3.5 8h9"/>',
    search: '<circle cx="7" cy="7" r="4.2"/><path d="m10.2 10.2 3.3 3.3"/>',
    terminal: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="m4.8 6.5 2 1.5-2 1.5M8.5 10H11"/>',
    log: '<path d="M3 4h10M3 8h10M3 12h6"/>',
    gauge: '<path d="M2.5 11.5a5.5 5.5 0 1 1 11 0"/><path d="m8 11.5 2.6-3.2"/>',
    pulse: '<path d="M1.5 8.5h3L6 4.5l3 7.5 1.5-3.5h4"/>',
    bell: '<path d="M4 11V7.5a4 4 0 0 1 8 0V11l1 1.3H3z"/><path d="M6.6 14h2.8"/>',
    sliders: '<path d="M3 4.5h10M3 8h10M3 11.5h10"/><circle class="f" cx="6" cy="4.5" r="1.4"/><circle class="f" cx="10.5" cy="8" r="1.4"/><circle class="f" cx="5" cy="11.5" r="1.4"/>',
    file: '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/>',
    edit: '<path d="m3 13 .9-3L10.5 3.4l2.1 2.1L6 12.1z"/>',
    check: '<path d="m3.5 8.5 3 3 6-7"/>',
    x: '<path d="m4.5 4.5 7 7M11.5 4.5l-7 7"/>',
    stop: '<rect x="4.5" y="4.5" width="7" height="7" rx="1" class="f"/>',
    clip: '<path d="M10.5 5 6.2 9.3a1.4 1.4 0 0 0 2 2l4.6-4.6a2.8 2.8 0 0 0-4-4L4.2 7.3a4.2 4.2 0 0 0 6 6L13.5 10"/>',
    image: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.1"/><path d="m2.5 12 4-3.5 3 2.5 1.8-1.4L14 11.8"/>',
    send: '<path d="M8 13V3.5M4 7.5l4-4 4 4"/>',
    clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/>',
    cpu: '<rect x="4.5" y="4.5" width="7" height="7" rx="1"/><path d="M6.5 2v2.5M9.5 2v2.5M6.5 11.5V14M9.5 11.5V14M2 6.5h2.5M2 9.5h2.5M11.5 6.5H14M11.5 9.5H14"/>',
    plug: '<path d="M6 2v3M10 2v3M4.5 5h7v2.5a3.5 3.5 0 0 1-7 0z"/><path d="M8 11v3"/>',
    user: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5a5 5 0 0 1 10 0"/>',
    nodes: '<circle cx="4" cy="4" r="1.8"/><circle cx="12" cy="4" r="1.8"/><circle cx="8" cy="12" r="1.8"/><path d="M5.6 4h4.8M4.9 5.6l2.2 4.8M11.1 5.6l-2.2 4.8"/>',
    layers: '<path d="M8 2.5 14 5.5 8 8.5 2 5.5z"/><path d="m2 8.5 6 3 6-3"/>',
    dots: '<circle class="f" cx="4" cy="8" r="1"/><circle class="f" cx="8" cy="8" r="1"/><circle class="f" cx="12" cy="8" r="1"/>',
    min: '<path d="M4 8.5h8"/>',
    max: '<rect x="4" y="4" width="8" height="8" rx=".5"/>',
    restore: '<rect x="3.5" y="5.5" width="7" height="7" rx=".5"/><path d="M5.5 5.5v-2h7v7h-2"/>',
    hide: '<path d="M3.5 12.5h9"/><path d="m5 7 3 3 3-3"/>',
    question: '<circle cx="8" cy="8" r="5.8"/><path d="M6.4 6.4a1.7 1.7 0 1 1 2.3 1.6c-.5.2-.7.6-.7 1v.4"/><circle class="f" cx="8" cy="11.2" r=".7"/>',
    shield: '<path d="M8 2 13 4v4c0 3-2.3 5-5 6-2.7-1-5-3-5-6V4z"/><path d="m6 8 1.5 1.5L10.3 6.6"/>',
    warn: '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3"/><circle class="f" cx="8" cy="11.2" r=".7"/>',
    collapse: '<path d="m4.5 6 3.5-3 3.5 3M4.5 10l3.5 3 3.5-3"/>',
    filter: '<path d="M2.5 3.5h11l-4 5V13l-3-1.5v-3z"/>',
    route: '<circle cx="4" cy="12" r="1.6"/><circle cx="12" cy="4" r="1.6"/><path d="M4 10.4V8.5a2 2 0 0 1 2-2h4a2 2 0 0 0 2-2"/>',
    play: '<path d="M5 3.5v9l7-4.5z"/>',
    refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 3v2.6h-2.6"/>',
    coin: '<circle cx="8" cy="8" r="5.8"/><path d="M9.9 6.3c-.3-.6-1-1-1.9-1-1 0-1.8.5-1.8 1.3 0 1.8 3.7 1 3.7 2.8 0 .8-.8 1.4-1.9 1.4-.9 0-1.6-.4-1.9-1M8 4.2v1.1M8 10.8v1.1"/>',
    pin: '<path d="M6 2.5h4l-.6 4 2.1 2.2H4.5L6.6 6.5z"/><path d="M8 8.7V14"/>',
    queue: '<path d="M3 4h10M3 7.5h10M3 11h5"/><path d="m11 10 1.8 1.5L11 13"/>',
    tool: '<path d="M10.5 2.5a3 3 0 0 0-3.2 4L2.8 11a1.5 1.5 0 0 0 2.2 2.2l4.5-4.5a3 3 0 0 0 4-3.2l-1.9 1.9-1.8-.4-.4-1.8z"/>',
    expand: '<path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9"/>',
    split: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M8 3v10"/>',
    info: '<circle cx="8" cy="8" r="5.8"/><path d="M8 7.3v3.7"/><circle class="f" cx="8" cy="5.1" r=".7"/>',
    minus: '<path d="M4.5 8h7"/>',
    eject: '<path d="M8 3.5 13 9H3z"/><path d="M3.5 12h9"/>',
    download: '<path d="M8 2.5v8"/><path d="m4.5 7 3.5 3.5L11.5 7"/><path d="M3.5 13h9"/>',
    external: '<path d="M9 3h4v4"/><path d="M13 3 7.5 8.5"/><path d="M11 9.5V13H3V5h3.5"/>',
    eye: '<path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="2"/>',
    "eye-off": '<path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8z"/><path d="M3 13 13 3"/>',
    copy: '<rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1"/><path d="M3 10.5V3h7.5"/>',
    globe: '<circle cx="8" cy="8" r="5.8"/><path d="M2.2 8h11.6M8 2.2c1.8 1.6 2.6 3.6 2.6 5.8S9.8 12.2 8 13.8C6.2 12.2 5.4 10.2 5.4 8S6.2 3.8 8 2.2z"/>',
    "chev-left": '<path d="M9.5 4.5 6 8l3.5 3.5"/>',
    "chev-up": '<path d="M4.5 9.5 8 6l3.5 3.5"/>',
    "arrow-down": '<path d="M8 3v10M4.5 9.5 8 13l3.5-3.5"/>',
    monitor: '<rect x="2" y="3" width="12" height="8.5" rx="1.2"/><path d="M6 14h4M8 11.5V14"/>',
    share: '<path d="M8 2.5v8M5 5.5l3-3 3 3"/><path d="M4 8.5H3.5v5h9v-5H12"/>',
    zoom: '<circle cx="7" cy="7" r="4.2"/><path d="m10.2 10.2 3.3 3.3M5.2 7h3.6M7 5.2v3.6"/>',
    moon: '<path d="M12.8 9.8A5.3 5.3 0 0 1 6.2 3.2a5.3 5.3 0 1 0 6.6 6.6z"/>'
  };

  // Знак моста: реплика мессенджера с вырезанным приглашением терминала «>_» (сетка 24).
  var MARK = '<path fill-rule="evenodd" d="M2 6a3 3 0 013-3h14a3 3 0 013 3v9a3 3 0 01-3 3H10.2l-4.6 3.6a.8.8 0 01-1.3-.6V18H5a3 3 0 01-3-3zM6 7.2l1.3-1.4 4 3.7-4 3.7L6 11.8l2.6-2.3zM12.5 11.2H17V13h-4.5z"/>';

  function icon(name, cls, label) {
    var body = P[name] || P.dots;
    var a = label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"';
    return '<svg class="tb-i' + (cls ? ' ' + cls : '') + '" viewBox="0 0 16 16"' + a + '>' + body + '</svg>';
  }
  function mark(size, label) {
    var s = size || 20;
    return '<svg class="tb-mark" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="currentColor"' + (label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') + '>' + MARK + '</svg>';
  }
  // <i data-i="name" class="sm"></i> → inline SVG; <i data-i="mark" data-s="18"></i> → знак
  function hydrate(root) {
    var els = (root || document).querySelectorAll('i[data-i]');
    for (var k = 0; k < els.length; k++) {
      var el = els[k], n = el.getAttribute('data-i'), lb = el.getAttribute('aria-label');
      var html = n === 'mark' ? mark(+el.getAttribute('data-s') || 20, lb) : icon(n, el.className, lb);
      var tmp = document.createElement('span'); tmp.innerHTML = html;
      el.parentNode.replaceChild(tmp.firstChild, el);
    }
  }

  // ── цвет: разбор, смешивание и контраст без color-mix() (Android WebView < Chrome 111) ──
  function rgb(c) {
    if (!c) return null; c = String(c).trim();
    var m = /^#([0-9a-f]{3,8})$/i.exec(c);
    if (m) { var h = m[1]; if (h.length < 6) h = h.replace(/./g, '$&$&'); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    m = /^rgba?\(([^)]+)\)/i.exec(c);
    if (m) { var p = m[1].split(/[ ,\/]+/); return [+p[0], +p[1], +p[2]]; }
    return null;
  }
  function hex(a) { return '#' + a.map(function (v) { return ('0' + Math.round(v).toString(16)).slice(-2); }).join(''); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); if (!x || !y) return null; return hex([0, 1, 2].map(function (i) { return x[i] * t + y[i] * (1 - t); })); }
  function lum(c) { var a = rgb(c).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
  function contrast(a, b) { if (!rgb(a) || !rgb(b)) return 0; var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  /* Тема. Вызвать после Telegram.WebApp.ready() и на событие themeChanged.
     consoleTheme=true — тема «Консоль» (тёмная Shirabe), Telegram-цвета не используются. */
  var DERIVED = ['--accent.subtle', '--bg.selected', '--bg.surface-2', '--bg.pressed', '--bg.code', '--border.default'];
  function applyTelegramTheme(webApp, consoleTheme) {
    var html = document.documentElement, st = html.style;
    // имена свойств без экранирования: в CSS «--bg\.code» объявляет свойство «--bg.code»
    DERIVED.forEach(function (n) { st.removeProperty(n); });
    if (consoleTheme) { html.setAttribute('data-theme', 'console'); html.classList.remove('tg-live', 'tg-hint-ok'); return 'console'; }
    var dark = webApp && webApp.colorScheme === 'dark';
    html.setAttribute('data-theme', dark ? 'tg-dark' : 'tg-light');
    var p = (webApp && webApp.themeParams) || {};
    if (!p.bg_color) { html.classList.remove('tg-live', 'tg-hint-ok'); return html.getAttribute('data-theme'); }
    html.classList.add('tg-live');
    var surf = p.section_bg_color || p.bg_color, base = p.secondary_bg_color || p.bg_color, text = p.text_color || (dark ? '#ffffff' : '#000000');
    // hint-color — только если он держит 4.5:1 на обеих подложках, иначе остаётся text.secondary темы
    var ok = p.hint_color && contrast(p.hint_color, surf) >= 4.5 && contrast(p.hint_color, base) >= 4.5;
    html.classList.toggle('tg-hint-ok', !!ok);
    // производные цвета считаем здесь, чтобы не зависеть от color-mix()
    var set = function (n, v) { if (v) st.setProperty(n, v); };
    set('--accent.subtle', mix(p.button_color, surf, dark ? 0.22 : 0.12));
    set('--bg.selected', mix(p.button_color, surf, dark ? 0.22 : 0.12));
    set('--bg.surface-2', mix(text, surf, dark ? 0.07 : 0.05));
    set('--bg.pressed', mix(text, surf, dark ? 0.12 : 0.1));
    set('--bg.code', mix(text, surf, dark ? 0.03 : 0.035));
    set('--border.default', mix(text, surf, dark ? 0.16 : 0.14));
    return html.getAttribute('data-theme');
  }

  window.TgBridge = { icons: P, icon: icon, mark: mark, markPath: MARK, hydrate: hydrate, applyTelegramTheme: applyTelegramTheme, mix: mix, contrast: contrast };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { hydrate(); });
  else hydrate();
})();
