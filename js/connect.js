// Подключение телефона без Telegram (016, US1 сц. 2 и 4; contracts/device-api.md). Ссылка
// из QR доступа не даёт: телефон просит его у моста, а человек разрешает на компьютере, в
// трее. Здесь — экраны запроса, ожидания, отказа и истечения и опрос статуса запроса.

import { slotOf } from './device.js?v=238';
import { esc, icon } from './util.js?v=238';
import { guideFor, guideIcon } from './install-guide.js?v=238';

const NAME_MAX = 60; // больше мост не примет

// «Android · Chrome» — так запрос подписан в трее: чужое устройство должно быть видно сразу.
export function deviceName(nav) {
  nav = nav ?? globalThis.navigator ?? {};
  const ua = String(nav.userAgent ?? '');
  const brands = (nav.userAgentData?.brands ?? []).map((b) => String(b.brand));
  let os = nav.userAgentData?.platform || '';
  if (!os) os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const brand = (re) => brands.some((b) => re.test(b)) || re.test(ua);
  // Порядок важен: в UA Chrome есть «Safari», в UA Edge и Samsung — «Chrome».
  const browser = brand(/Edg/) ? 'Edge' : brand(/SamsungBrowser|Samsung Internet/) ? 'Samsung Internet' : brand(/YaBrowser|Yandex/) ? 'Яндекс' : brand(/Firefox|FxiOS/) ? 'Firefox'
    : brand(/Chrome|Chromium|CriOS/) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
  return [os, browser].filter(Boolean).join(' · ') || 'Телефон';
}

const hostOf = (url) => { try { return new URL(url).host; } catch { return String(url ?? ''); } };

const screen = (body) => `<div class="tb-scr"><div class="tb-head"><h1>Подключить телефон</h1></div><div class="tb-scroll tb-connect">${body}</div></div>`;
const again = (label = 'Попросить снова') => `<button class="tb-btn tb-btn--primary" data-act="pwa-again">${icon('refresh')}${esc(label)}</button>`;

/**
 * Отпечаток ключа для сверки с диалогом трея — тот же, что считает мост (src/devices.ts,
 * fingerprint): sha256 от SPKI, четыре группы по 4 hex.
 */
export async function keyFingerprint(spkiB64url, subtle = globalThis.crypto?.subtle) {
  if (!spkiB64url || !subtle) return '';
  const bin = atob(spkiB64url.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const hex = [...new Uint8Array(await subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return [0, 4, 8, 12].map((i) => hex.slice(i, i + 4)).join(' ');
}

export function connectScreen(st) {
  const host = esc(hostOf(st.machine?.url));
  switch (st.phase) {
    case 'install': {
      // Вне Telegram мост — приложение, а не сайт (решение владельца): в браузере только то,
      // как его поставить. Ссылка подключения — чтобы перенести её в приложение (на iPhone у
      // него своё хранилище, отдельное от Safari).
      const copyBtn = st.link ? `<button class="tb-btn tb-btn--block" data-act="pwa-gate-copy">${icon('copy')}${st.copied ? 'Ссылка скопирована' : 'Скопировать ссылку подключения'}</button>` : '';
      if (st.kind === 'prompt') {
        return screen(`<div class="tb-empty">${icon('download')}<div class="t">Мост работает как приложение</div><div class="d">Установите мост как приложение — он откроется с иконки, без строки браузера.</div></div><button class="tb-btn tb-btn--primary tb-btn--block" data-act="pwa-gate-install">${icon('download')}Установить</button>${copyBtn}`);
      }
      // Сама страница поставить себя на экран «Домой» не может (на iPhone «Поделиться» от
      // страницы такого пункта не даёт, проверено в 016) — показываем, где кнопка в этом браузере.
      const g = st.guide ?? guideFor('', '');
      const last = g.steps.length - 1;
      const steps = g.steps.map((s, i) => `<div class="tb-step"><span class="n">${i + 1}</span>${guideIcon(s.icon)}<span class="tx">${s.html}${i === last && st.link ? ' и нажмите <b>«Вставить из буфера»</b> — ссылку скопируйте ниже' : ''}</span></div>`).join('');
      const arrow = g.arrow === 'none' ? '' : `<div class="tb-arrow tb-arrow--${g.arrow}" aria-hidden="true">${icon('arrow-down')}</div>`;
      return screen(`<div class="tb-empty">${icon('download')}<div class="t">Мост работает как приложение</div><div class="d">Поставьте его на экран «Домой»:</div></div><div class="tb-steps">${steps}</div>${copyBtn}${arrow}`);
    }
    case 'none':
      // Приложение с экрана «Домой» на iPhone живёт отдельно от Safari: QR камера откроет в
      // Safari, а сюда ссылку переносят буфером (живая проверка 016).
      return screen(`<div class="tb-empty">${icon('monitor')}<div class="t">Компьютер не подключён</div><div class="d">Откройте на компьютере трей моста → «Настройки» → «Устройства» → «Добавить устройство» и отсканируйте QR-код камерой телефона. На iPhone страница из QR даст ссылку подключения — вставьте её сюда.</div></div>`
        + `<label class="tb-lbl">Ссылка подключения<input class="tb-field tb-field--box" data-role="link" placeholder="https://…#m=…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>`
        + (st.error ? `<div class="help err">${icon('warn', 'sm')}${esc(st.error)}</div>` : '')
        + `<button class="tb-btn tb-btn--block" data-act="pwa-paste">${icon('copy')}Вставить из буфера</button>`
        + `<button class="tb-btn tb-btn--primary tb-btn--block" data-act="pwa-link">${icon('send')}Подключить</button>`);
    case 'wait':
      return screen(`<div class="tb-empty">${icon('shield')}<div class="t">Ждём разрешения на компьютере</div><div class="d">На компьютере ${host} трей спросит, пустить ли «${esc(st.name)}». Нажмите там «Разрешить», если отпечаток совпадает. Запрос ждёт 5 минут.</div>${st.fingerprint ? `<div class="d">Отпечаток ключа: <b class="tb-mono" data-role="fingerprint">${esc(st.fingerprint)}</b></div>` : ''}<div class="a"><span class="tb-spin" aria-label="Ждём"></span></div><div class="a"><button class="tb-btn" data-act="pwa-again">Отменить</button></div></div>`);
    case 'denied':
      return screen(`<div class="tb-empty">${icon('x')}<div class="t">Доступ не разрешён</div><div class="d">Компьютер ${host} отклонил запрос. Если это вы — попросите снова и нажмите в трее «Разрешить».</div><div class="a">${again()}</div></div>`);
    case 'expired':
      return screen(`<div class="tb-empty">${icon('clock')}<div class="t">Запрос истёк</div><div class="d">На компьютере ${host} никто не ответил за 5 минут.</div><div class="a">${again()}</div></div>`);
    default: {
      const busy = st.phase === 'sending';
      return screen(`<div class="tb-empty">${icon('monitor')}<div class="t">Подключить этот телефон</div><div class="d">к компьютеру ${host}. Ссылка из QR сама доступа не даёт — его разрешают на компьютере, один раз.</div></div>`
        + `<label class="tb-lbl">Имя телефона — так его увидит трей<input class="tb-field tb-field--box" data-role="device-name" value="${esc(st.name)}" maxlength="${NAME_MAX}" autocomplete="off"></label>`
        + (st.error ? `<div class="help err">${icon('warn', 'sm')}${esc(st.error)}</div>` : '')
        + `<button class="tb-btn tb-btn--primary tb-btn--block${busy ? ' is-busy' : ''}" data-act="pwa-request"${busy ? ' disabled' : ''}>${busy ? '<span class="tb-spin"></span>' : icon('send')}Запросить доступ</button>`);
    }
  }
}

export function createConnect({ root, fetch: f, device, machine, name = deviceName(), onApproved, pollMs = 2000 }) {
  const st = { phase: 'ask', name, machine, error: '', requestId: '', fingerprint: '' };
  let timer;
  let alive = true;
  let gen = 0; // каждая попытка — своя: ответ старого опроса новую не трогает

  const render = () => { if (alive) { root.innerHTML = connectScreen(st); globalThis.TgBridge?.hydrate?.(root); } };
  const base = String(machine.url).replace(/\/+$/, '');
  let pollBase = base;

  async function request() {
    const nm = st.name.trim().slice(0, NAME_MAX);
    if (!nm || st.phase === 'sending') return;
    // Поле имени уходит со страницы — сначала клавиатура (iOS иначе не вернёт высоту окна).
    /** @type {HTMLElement | null} */ (root.ownerDocument?.activeElement)?.blur?.();
    st.phase = 'sending';
    st.error = '';
    render();
    const my = ++gen;
    try {
      const { publicKey } = await device.prepare(slotOf(machine));
      // Отпечаток — следом, не задерживая запрос: экран ожидания дорисует его, как посчитается.
      void keyFingerprint(publicKey).then((fp) => { if (my === gen && fp) { st.fingerprint = fp; if (st.phase === 'wait') render(); } }).catch(() => {});
      const res = await f(`${base}/api/pwa/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nm, publicKey }) });
      const j = await res.json().catch(() => ({}));
      if (my !== gen) return;
      if (res.status === 429) throw new Error('С этого адреса уже ждут ответа два запроса — ответьте на них в трее или подождите 5 минут');
      if (!res.ok || !j.requestId) throw new Error(j.message || `Мост ответил ${res.status}`);
      st.requestId = j.requestId;
      // 018: по общему домену запросы раскладываются по машинам — статус знает только принявшая.
      pollBase = /^https?:\/\//.test(j.poll ?? '') ? String(j.poll).replace(/\/+$/, '') : base;
      st.name = nm;
      st.phase = 'wait';
      render();
      schedule(my);
    } catch (e) {
      if (my !== gen) return;
      st.phase = 'ask';
      st.error = e instanceof TypeError || e?.name === 'AbortError' ? 'Компьютер не ответил — проверьте, что он включён и мост запущен' : e.message;
      render();
    }
  }

  function schedule(my) {
    clearTimeout(timer);
    timer = setTimeout(() => void poll(my), pollMs);
  }

  async function poll(my) {
    if (!alive || my !== gen) return;
    let j;
    try {
      const res = await f(`${pollBase}/api/pwa/request/${encodeURIComponent(st.requestId)}`, { method: 'GET' });
      if (my !== gen) return;
      // Мост перезапустился и запрос забыл — для человека это то же «истекло».
      if (res.status === 404) j = { status: 'expired' };
      else j = await res.json().catch(() => ({}));
    } catch {
      // Туннель моргнул — ждём дальше: решение на компьютере могли уже принять.
      return schedule(my);
    }
    if (my !== gen) return;
    if (j.status === 'approved' && j.deviceId) {
      await device.approve(slotOf(machine), j.deviceId, j.token ?? null);
      // Одноразовый токен (ZeroTier) мог уйти в потерянном ответе — пропуска нет: просим заново,
      // а не возвращаем на этот же экран по кругу (ревью 016).
      if (!(await device.has(slotOf(machine)))) { st.phase = 'expired'; return render(); }
      alive = false;
      // 018: машина владельца — с допуском и всеми его машинами: приложение сохранит их вкладками.
      const owner = j.ownerId && Array.isArray(j.machines) ? { ownerId: j.ownerId, grant: j.grant, machines: j.machines } : undefined;
      return void (owner ? onApproved?.(machine, owner) : onApproved?.(machine));
    }
    if (j.status === 'denied' || j.status === 'expired') { st.phase = j.status; return render(); }
    schedule(my);
  }

  function onClick(ev) {
    const el = ev.target.closest?.('[data-act]');
    if (!el || !root.contains(el)) return;
    if (el.dataset.act === 'pwa-request') return void request();
    if (el.dataset.act === 'pwa-again') { gen++; clearTimeout(timer); st.phase = 'ask'; st.error = ''; return render(); }
  }
  function onInput(ev) {
    if (ev.target?.dataset?.role === 'device-name') st.name = ev.target.value;
  }

  return {
    state: st,
    start() {
      root.addEventListener('click', onClick);
      root.addEventListener('input', onInput);
      render();
    },
    stop() {
      alive = false;
      gen++;
      clearTimeout(timer);
      root.removeEventListener('click', onClick);
      root.removeEventListener('input', onInput);
    },
  };
}
