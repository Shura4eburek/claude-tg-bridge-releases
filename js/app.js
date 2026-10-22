// Мини-аппа v2 — контроллер. Состояние → экран (views.js) → разметка; действия — по
// data-act одним обработчиком на корне. Данные — /api/v2 (api.js): список и лента
// long-poll'ом, сессии хоста Shirabe и терминальные одной моделью событий.
// Вне Telegram (016) — то же приложение: машины телефона из QR, вход ключом устройства.

import { createApi, parseFileUrl } from './api.js?v=238';
import { copyText } from './clipboard.js?v=238';
import { connectScreen, createConnect } from './connect.js?v=238';
import { createDevice, slotOf } from './device.js?v=238';
import { openStores } from './idb.js?v=238';
import { linkOf, createMachines } from './machines.js?v=238';
import { busy, pendingCard, turnStart } from './model.js?v=238';
import { guideFor } from './install-guide.js?v=238';
import { findAddress } from './rendezvous.js?v=238';
import { createShare } from './share.js?v=238';
import { AUTO_PAUSE_MS, applyChoice, autoBlocked, decideKey, manualDecision, pairKnown } from './auto.js?v=238';
import { chatScreen, closeSheet, diffScreen, localDeleteSheet, localMachines, localScreen, menuSheet, modelSheet, resumeSheet, trustSheet, outageSheet, stopSheet, projectsScreen, renameSheet, sessionsScreen, settingsScreen, startSheet, viewer } from './views.js?v=238';
import { timer } from './util.js?v=238';

export function createApp({
  root, tg, fetch: f, storage, location: loc, TgBridge, now = () => Date.now(), random = () => Math.random().toString(36).slice(2),
  stores = undefined, crypto = globalThis.crypto, history = globalThis.history, secure = globalThis.isSecureContext !== false, install = undefined,
  autoPauseMs = AUTO_PAUSE_MS,
}) {
  // Режим — по подписи Telegram: скрипт telegram-web-app.js грузится и в браузере, но
  // initData там пустой (research R4).
  const pwa = !tg?.initData;
  // Машины телефона (вне Telegram) и «единственная машина»: с одной машиной вкладок нет,
  // а запросы идут на её адрес; в Telegram её адрес пустой — тот же origin, что и аппа.
  let phone = [];
  // 018: каким машинам владельца допуск уже отдавали после отказа — второй раз не поможет.
  const granted = new Set();
  const solo = { id: '', url: '' };
  const phoneOf = (base) => phone.find((m) => m.url === base);
  let device;
  let machinesDb;
  if (pwa) {
    const st = stores ?? openStores();
    device = createDevice({ keys: st.keys, storage, crypto });
    machinesDb = createMachines({ store: st.machines, location: loc, history });
  }
  const api = createApi({
    fetch: f,
    initData: tg?.initData ?? '',
    ...(pwa ? {
      auth: async ({ base, method, pathQuery, body }) => { const m = phoneOf(base); return m ? device.headers(slotOf(m), method, pathQuery, body) : {}; },
      relocate: (base) => relocate(base),
    } : {}),
  });
  const store = {
    get: (k) => { try { return storage?.getItem(k) ?? null; } catch { return null; } },
    set: (k, v) => { try { storage?.setItem(k, v); } catch { /* без хранилища обойдёмся */ } },
  };
  const state = {
    screen: 'sessions',
    machines: [],
    machineTab: store.get('bridge-machine-tab') ?? '',
    machinesDown: [],
    // 017: соседи с другим ботом — Telegram-подпись этого бота они не принимают.
    machinesAppOnly: [],
    sessions: [],
    loading: true,
    hostDownBy: {},
    netError: '',
    projects: {},
    projectList: [],
    closedList: [],
    accounts: {},
    catalog: {},
    openId: '',
    events: [],
    queue: [],
    cursor: undefined,
    boot: undefined,
    loadingFeed: false,
    draft: '',
    files: [],
    failed: [],
    // 020: отправленное, но ещё не подтверждённое мостом — видно сразу, с «отправляется…».
    pending: [],
    sending: false,
    stop: {},
    choice: [],
    own: false,
    deciding: null,
    sheet: null,
    settings: {},
    settingsBusy: {},
    settingsError: '',
    theme: store.get('bridge-theme') === 'console' ? 'console' : 'tg',
    about: '',
    // Итог действия, которому не нашлось места в листе (доверие к папке).
    notice: '',
    // Развёрнутые блоки кода («событие:номер») — перерисовка ленты их не сворачивает.
    expanded: new Set(),
    // Файлы агента, которых уже нет на диске: карточка говорит «недоступен».
    missing: new Set(),
    // US2: есть ли события раньше показанных, подгрузка «Показать раньше», новые внизу.
    more: false,
    earlier: {},
    unseen: 0,
    // US3/US5: git проекта открытой сессии; сводка статуса Anthropic.
    diff: null,
    status: null,
    // 021: что умеет хост каждой машины, состояние Ollama по машинам, поле «Скачать модель».
    featuresBy: {},
    localBy: {},
    localTab: '',
    pullName: '',
  };
  // Расстояние от низа ленты, которое надо сохранить при подгрузке сверху; флаг «вниз».
  let anchor = null;
  // Разметка листа в последней отрисовке — неизменившийся лист остаётся тем же узлом.
  let lastSheet = '';
  let wasBusy = false;
  let statusTimer;
  let closingOn = false;
  let forceBottom = false;
  let alive = true;
  let feedToken = 0;
  const lists = new Map(); // машина → версия списка
  const sessionsBy = new Map(); // машина → её сессии

  const machineOf = (id) => state.sessions.find((s) => s.id === id)?.machine ?? '';
  const baseOf = (machine) => state.machines.find((m) => m.id === machine)?.url ?? solo.url;
  const sessionBase = (id) => baseOf(machineOf(id));
  const opened = () => state.sessions.find((s) => s.id === state.openId);

  // --- тема ---------------------------------------------------------------------
  // Возможности Telegram появлялись в разных версиях Bot API; старый клиент на вызов
  // новой бросает исключение — спрашиваем версию заранее.
  const supports = (v) => { try { return tg?.isVersionAtLeast?.(v) === true; } catch { return false; } };

  // Тактильный отклик (6.1+): итог действия — notification, нажатие — impact, выбор —
  // selection. Без него кнопки на телефоне «ватные» — так было в старом мосте.
  function haptic(kind) {
    const h = tg?.HapticFeedback;
    if (!h || !supports('6.1')) return;
    try {
      if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred?.(kind);
      else if (kind === 'select') h.selectionChanged?.();
      else h.impactOccurred?.(kind || 'light');
    } catch { /* отклик — не повод ронять действие */ }
  }

  function applyTheme() {
    TgBridge?.applyTelegramTheme?.(tg, state.theme === 'console');
    // Панели клиента — под фон: шапка как фон экрана, нижний бар как навигация и док.
    const css = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
    const base = css?.getPropertyValue('--bg.base').trim() || 'secondary_bg_color';
    const surface = css?.getPropertyValue('--bg.surface-1').trim() || 'bg_color';
    if (supports('6.9')) tg?.setHeaderColor?.(base);
    if (supports('7.10')) tg?.setBottomBarColor?.(surface);
  }

  // --- отрисовка ----------------------------------------------------------------
  function view() {
    // Адрес не ответил, ищем новый в точке встречи — это и показываем вместо «мост не ответил».
    const netError = state.searching ? 'Адрес компьютера мог смениться — ищу новый адрес…' : state.netError;
    const ctx = { ...state, netError, pwa, install: state.screen === 'settings' ? installKind() : '', now: now(), readOf: (id) => store.get(`read:${id}`) };
    if (state.screen === 'chat') {
      const session = opened();
      const fileUrl = session ? (path) => { const u = api.fileUrl(sessionBase(session.id), session.id, path); return blobs.get(u) ?? u; } : undefined;
      return chatScreen({ ...ctx, session, busy: busy(session), turnStart: turnStart(state.events), fileUrl }) + (state.viewer ? viewer(state.viewer) : '');
    }
    if (state.screen === 'diff') return diffScreen({ ...ctx, session: opened() });
    if (state.screen === 'projects') return projectsScreen(ctx);
    if (state.screen === 'settings') return settingsScreen(ctx);
    if (state.screen === 'local') return localScreen(ctx);
    return sessionsScreen(ctx);
  }

  function sheetView() {
    const sh = state.sheet;
    if (!sh) return '';
    if (sh.kind === 'start') return startSheet(sh);
    if (sh.kind === 'model') return modelSheet(sh);
    if (sh.kind === 'rename') return renameSheet(sh);
    if (sh.kind === 'menu') return menuSheet({ session: opened() });
    if (sh.kind === 'outage') return outageSheet(state.status);
    if (sh.kind === 'stop') return stopSheet();
    if (sh.kind === 'close') return closeSheet(sh);
    if (sh.kind === 'resume') return resumeSheet(sh);
    if (sh.kind === 'trust') return trustSheet(sh);
    if (sh.kind === 'local-delete') return localDeleteSheet(sh);
    return '';
  }

  function render() {
    if (!alive) return;
    // Набранное и фокус переживают перерисовку: экран пересобирается целиком, а
    // текст в поле — то, что человек набирал пальцем.
    // 021: и поле задачи «Авто» — решение приходит, пока человек ещё правит текст.
    const act = root.ownerDocument.activeElement;
    const role = act && root.contains(act) && ['draft', 'first', 'pull-name'].includes(act.dataset?.role) ? act.dataset.role : '';
    const focused = Boolean(role);
    const sel = focused ? [act.selectionStart, act.selectionEnd] : null;
    // Список (сессии, проекты, настройки) пересобирается при каждом обновлении — без этого его
    // прокрутка прыгала к началу каждые несколько секунд. Лист — так же.
    const listScroll = root.querySelector('.tb-scr > .tb-list, .tb-scr > .tb-scroll')?.scrollTop ?? 0;
    const sheetScroll = root.querySelector('.tb-sheet')?.scrollTop ?? 0;
    const screenWas = state.screen;
    const feed = root.querySelector('[data-role="feed"]');
    const atBottom = isAtBottom(feed);
    const prevTop = feed ? feed.scrollTop : null;
    if (atBottom) state.unseen = 0;
    // Лист, который не изменился, не пересобираем: фоновое обновление списка (раз в несколько
    // секунд) закрывало открытый в нём выпадающий список и съедало нажатие — палец попадал в
    // кнопку, которую уже заменила новая (живая проверка 1.3.1: «Начать» в «Авто» не нажималась).
    const sheetHtml = sheetView();
    const oldSheet = sheetHtml && sheetHtml === lastSheet ? [...root.children].find((el) => el.classList.contains('tb-scrim')) : null;
    if (oldSheet) {
      oldSheet.remove();
      root.innerHTML = view();
      root.append(oldSheet);
    } else root.innerHTML = view() + sheetHtml;
    lastSheet = sheetHtml;
    TgBridge?.hydrate?.(root);
    const ta2 = focused ? root.querySelector(`[data-role="${role}"]`) : null;
    if (ta2) { ta2.focus(); ta2.setSelectionRange(sel[0], sel[1]); }
    const list2 = root.querySelector('.tb-scr > .tb-list, .tb-scr > .tb-scroll');
    if (list2 && screenWas === state.screen && listScroll) list2.scrollTop = listScroll;
    const sheet2 = root.querySelector('.tb-sheet');
    if (sheet2 && sheetScroll) sheet2.scrollTop = sheetScroll;
    const feed2 = root.querySelector('[data-role="feed"]');
    if (feed2) {
      // Подгрузка сверху — держим расстояние от низа, иначе читаемое уехало бы вниз.
      if (anchor !== null) feed2.scrollTop = feed2.scrollHeight - anchor;
      else if (atBottom || forceBottom) { feed2.scrollTop = feed2.scrollHeight; state.unseen = 0; }
      // Разметка пересобрана целиком — без этого отлистанная лента прыгала бы к началу.
      else if (prevTop !== null) feed2.scrollTop = prevTop;
    }
    anchor = null;
    forceBottom = false;
    syncBack();
    checkFiles();
    loadImages();
  }

  // --- файлы (#79) ----------------------------------------------------------------
  // В разметке — адрес-имя файла без секретов; открыть, скачать или показать картинку —
  // по одноразовому ключу (POST /api/v2/file-key). Картинку держим blob'ом: перерисовка
  // пересобирает <img>, и ключ на 60 с не пережил бы второй кадр ленты.
  const blobs = new Map(); // адрес-имя → blob:
  const blobOf = new Map(); // blob: → адрес-имя
  async function keyed(url, download) {
    const p = parseFileUrl(url);
    const r = await api.fileKey(p.base, p.sessionId, p.path);
    return api.fileByKey(p.base, r.key, download);
  }

  // Есть ли файл на диске — по заголовкам ответа, тело не качаем. Один раз на адрес.
  const checked = new Set();
  function checkFiles() {
    for (const el of root.querySelectorAll('.tb-file[data-check]')) {
      const url = el.dataset.check;
      if (checked.has(url)) continue;
      checked.add(url);
      const ctl = new AbortController();
      const gone = () => { state.missing.add(url); render(); };
      Promise.resolve(parseFileUrl(url) ? keyed(url).then((u) => f(u, { signal: ctl.signal })) : f(url, { signal: ctl.signal })).then((r) => {
        ctl.abort();
        if (r.status === 404) gone();
      }).catch((e) => { if (e?.status === 404) gone(); /* иначе сеть моргнула — пусть остаётся ссылкой */ });
    }
  }

  const loadingImg = new Set();
  function loadImages() {
    for (const img of root.querySelectorAll('img[src*="/api/v2/file?"]')) {
      const url = img.getAttribute('src');
      if (!parseFileUrl(url) || blobs.has(url) || loadingImg.has(url)) continue;
      loadingImg.add(url);
      keyed(url).then((u) => f(u)).then(async (r) => {
        if (!r.ok) return;
        const b = URL.createObjectURL(await r.blob());
        blobs.set(url, b);
        blobOf.set(b, url);
        render();
      }).catch(() => { /* нет файла — плитка сама скажет «файл недоступен» */ });
    }
  }

  async function openFile(url) {
    // Вне Telegram окно открываем сразу, в жесте нажатия: после await браузер счёл бы его всплывающим.
    const w = !pwa ? null : root.ownerDocument.defaultView?.open?.('', '_blank');
    try {
      const u = await keyed(url);
      if (w) { w.opener = null; w.location.href = u; } else openLink(absolute(u));
    } catch (e) {
      w?.close?.();
      state.netError = e.status === 404 ? 'Файла уже нет на диске' : e.message;
      render();
    }
  }

  function isAtBottom(feed) {
    return !feed || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
  }

  // Кнопка «назад» Telegram: из чата и листа — назад, со списков — её нет.
  function syncBack() {
    const bb = tg?.BackButton;
    if (!bb) return;
    if (state.sheet || state.screen === 'chat' || state.screen === 'diff' || state.screen === 'local') bb.show?.();
    else bb.hide?.();
  }
  function back() {
    if (state.viewer) { state.viewer = null; return render(); }
    if (state.sheet) return dismissSheet();
    if (state.screen === 'diff') { state.screen = 'chat'; return render(); }
    if (state.screen === 'chat') { closeChat(); return render(); }
    if (state.screen === 'local') { closeLocal(); state.screen = 'settings'; return render(); }
  }

  // --- список сессий -------------------------------------------------------------
  function mergeLists() {
    const all = [];
    for (const m of state.machines.length ? state.machines : [solo]) {
      for (const s of sessionsBy.get(m.id) ?? []) all.push({ ...s, machine: m.id || undefined });
    }
    state.sessions = all;
    state.loading = false;
    // Отметки прочтения (FR-018): впервые увиденная сессия — прочитанной, иначе после
    // установки горело бы всё; открытый сейчас чат читается сам.
    for (const s of all) {
      if (s.lastAt && (s.id === state.openId || store.get(`read:${s.id}`) === null)) store.set(`read:${s.id}`, s.lastAt);
    }
  }

  async function listLoop(machine) {
    // Первый запрос — всегда: экран не должен остаться пустым; дальше — только пока видно.
    let first = true;
    for (;;) {
      if (!alive) return;
      if (!first) await whenShown();
      first = false;
      if (!alive) return;
      try {
        const r = await api.sessions(machine.url, lists.get(machine.id));
        lists.set(machine.id, r.v);
        sessionsBy.set(machine.id, r.sessions ?? []);
        state.machinesDown = state.machinesDown.filter((x) => x !== machine.id);
        // У каждой машины своё: иначе баннер показывал ответ той, что пришла последней, и мигал.
        state.hostDownBy = { ...state.hostDownBy, [machine.id]: r.sources?.host === 'down' };
        state.netError = '';
        mergeLists();
        onSessionsChanged();
      } catch (e) {
        if (!state.machinesDown.includes(machine.id)) state.machinesDown = [...state.machinesDown, machine.id];
        // В трее нажали «Забыть устройство» — дальше только новым разрешением (US1 сц. 7).
        if (pwa && e.code === 'device_auth') {
          const m = phoneOf(machine.url);
          // 018: машина владельца, выключенная при привязке, о телефоне не знает — отдаём ей допуск
          // и пробуем ещё раз. Один раз: забытого телефона допуск не вернёт, и тогда — как раньше.
          if (m?.grant && !granted.has(m.id)) {
            granted.add(m.id);
            if (await api.ownerGrant(m.url, [m.grant]).then(() => true, () => false)) continue;
          }
          state.deviceLost = m ? slotOf(m) : '';
          state.netError = 'Компьютер больше не пускает этот телефон — «Повторить» попросит доступ заново';
          render();
          return;
        }
        // 017: сосед от телефона с другим ботом — подпись Telegram у него не пройдёт никогда:
        // говорим, где он открывается, и не спрашиваем его снова.
        if (!pwa && e.code === 'unauthorized' && state.machines.length > 1 && machine.sources?.length && !machine.sources.includes('registry')) {
          state.machinesDown = state.machinesDown.filter((x) => x !== machine.id);
          sessionsBy.delete(machine.id);
          mergeLists();
          if (!state.machinesAppOnly.includes(machine.id)) state.machinesAppOnly = [...state.machinesAppOnly, machine.id];
          render();
          return;
        }
        if (state.machines.length < 2) state.netError = e.message === 'Мост не ответил' ? 'Мост не ответил — проверьте, что компьютер включён' : e.message;
        lists.delete(machine.id);
        render();
        await sleep(3000);
        continue;
      }
      render();
    }
  }

  function onSessionsChanged() {
    // Ход закончился — правки и ветка могли смениться: дифф перечитываем.
    const cur = opened();
    const nowBusy = busy(cur);
    if (cur && wasBusy && !nowBusy) void loadDiff(cur.id, true);
    wasBusy = nowBusy;
    // Пока сессия на ходу, ответ «Стоп» уже ушёл, а статус ещё «работает»: кнопку
    // «останавливаю…» держим до смены статуса, а не до ответа моста.
    const s = opened();
    if (state.stop.state === 'busy' && s && !busy(s)) state.stop = { state: 'done', at: new Date(now()).toISOString() };
    if (state.stop.state === 'done' && s && busy(s) && state.stop.at && now() - Date.parse(state.stop.at) > 5000) state.stop = {};
  }

  // --- лента открытой сессии ----------------------------------------------------
  function openChat(id) {
    // Вне Telegram «назад» системы (жест, кнопка Android) иначе закрыл бы приложение — шаг
    // истории на чат, его снятие закрывает чат (живая проверка 016).
    if (pwa && state.screen !== 'chat') { try { history?.pushState?.({ ctbChat: id }, ''); } catch { /* нет истории */ } }
    state.openId = id;
    state.screen = 'chat';
    const lastAt = state.sessions.find((x) => x.id === id)?.lastAt;
    if (lastAt) store.set(`read:${id}`, lastAt);
    state.events = [];
    state.queue = [];
    state.cursor = undefined;
    state.boot = undefined;
    state.loadingFeed = true;
    state.stop = {};
    state.choice = [];
    state.own = false;
    state.failed = [];
    // Пузыри «отправляется…» — свои у чата: чужой в этой ленте не сойдётся никогда.
    state.pending = [];
    state.deciding = null;
    state.more = false;
    state.earlier = {};
    state.unseen = 0;
    state.diff = null;
    // Черновик — свой у каждого чата (FR-012): набранное в другом сюда не переезжает.
    state.draft = store.get(`draft:${id}`) ?? '';
    state.files = [];
    wasBusy = busy(opened());
    syncClosing();
    render();
    void feedLoop(id, ++feedToken);
    void loadDiff(id);
  }
  function closeChat() {
    feedToken++;
    state.openId = '';
    state.screen = 'sessions';
    state.draft = '';
    state.files = [];
    syncClosing();
  }

  // Набранное или прикреплённое — закрытие аппы свайпом спрашивает (FR-011, 6.2+).
  function syncClosing() {
    // По openId, а не по экрану: на «Изменениях» набранное в чате никуда не делось.
    const want = Boolean(state.openId) && Boolean(state.draft.trim() || state.files.length);
    if (want === closingOn || !supports('6.2')) return;
    closingOn = want;
    try { if (want) tg?.enableClosingConfirmation?.(); else tg?.disableClosingConfirmation?.(); } catch { /* старый клиент */ }
  }

  // «Стоп» обрывает многоминутный ход — случайное нажатие не должно (FR-010).
  function askStop() {
    if (tg?.showConfirm && supports('6.2')) {
      tg.showConfirm('Остановить ход?', (ok) => { if (ok) void stop(); });
      return;
    }
    state.sheet = { kind: 'stop' };
    render();
  }

  function mergeEvents(list, reset) {
    // Копия, а не тот же массив: ниже в state.events дописывают, и общий с ответом
    // массив рос бы прямо под циклом, который по нему идёт.
    if (reset) { state.events = [...list]; return; }
    const idx = new Map(state.events.map((e, i) => [e.id, i]));
    for (const e of list) {
      const i = idx.get(e.id);
      if (i === undefined) { idx.set(e.id, state.events.length); state.events.push(e); } else state.events[i] = e;
    }
    settlePending();
  }

  /**
   * 020: пузырь «отправляется…» уходит, когда в ленте появилось сообщение владельца, которого не
   * было при отправке, с тем же началом (к тексту с файлом хост дописывает заметки о файлах).
   * По новизне события, а не по часам: часы телефона и компьютера расходятся, а повторное «да»
   * не должно сойтись с прежним.
   */
  function settlePending() {
    if (!state.pending.length) return;
    const taken = new Set();
    state.pending = state.pending.filter((p) => {
      const e = state.events.find((x) => x.type === 'message' && x.role === 'user' && !p.seen.has(x.id) && !taken.has(x.id) && String(x.text ?? '').trim().startsWith(p.text));
      if (e) taken.add(e.id);
      return !e;
    });
  }

  // 020: свёрнутая мини-аппа (или приложение в фоне) к мосту не ходит — батарея и трафик.
  const shown = () => root.ownerDocument.visibilityState !== 'hidden' && tg?.isActive !== false;
  let onShown = [];
  const fireShown = () => { if (!shown()) return; const all = onShown; onShown = []; for (const f of all) f(); };
  root.ownerDocument.addEventListener?.('visibilitychange', fireShown);
  tg?.onEvent?.('activated', fireShown);
  const whenShown = () => (shown() ? Promise.resolve() : new Promise((r) => { onShown.push(r); }));

  async function feedLoop(id, token) {
    let first = true;
    for (;;) {
      if (!alive || token !== feedToken) return;
      if (!first) await whenShown();
      if (!alive || token !== feedToken) return;
      try {
        const r = await api.history(sessionBase(id), id, state.cursor, state.boot, !first);
        if (token !== feedToken) return;
        // Отлистал вверх — новое не тянет ленту, а копится на кнопке «К последним».
        const known = new Set(state.events.map((e) => e.id));
        const fresh = (r.events ?? []).filter((e) => !known.has(e.id)).length;
        if (r.reset) state.more = r.more === true;
        else if (fresh && !isAtBottom(root.querySelector('[data-role="feed"]'))) state.unseen += fresh;
        mergeEvents(r.events ?? [], r.reset === true);
        state.cursor = r.cursor;
        state.boot = r.boot;
        state.queue = r.queue ?? [];
        state.loadingFeed = false;
        state.netError = '';
        // Новая карточка — выбор прошлой не тащим.
        const card = pendingCard(state.events);
        if (!card || card.kind !== 'question') { state.choice = []; state.own = false; }
        if (state.deciding && !card) state.deciding = null;
        const empty = !first && !(r.events ?? []).length && !r.reset;
        first = false;
        render();
        // Пустой ответ long-poll'а сразу — мост старой сборки или прокси без ожидания:
        // без паузы цикл крутился бы впустую и жёг батарею телефона.
        if (empty) await sleep(1500);
      } catch (e) {
        if (token !== feedToken) return;
        state.loadingFeed = false;
        state.netError = e.status === 404 ? '' : e.message;
        if (e.status === 404) { render(); return; }
        render();
        await sleep(3000);
      }
    }
  }

  // --- действия ----------------------------------------------------------------
  async function send() {
    const s = opened();
    const text = state.draft.trim();
    if (!s || (!text && !state.files.length) || state.sending) return;
    const requestId = random();
    const files = state.files.map((x) => ({ name: x.name, data: x.data }));
    haptic('light');
    state.sending = true;
    // Сразу в ленту: на медленной сети иначе казалось, что сообщение пропало.
    if (text) state.pending = [...state.pending, { id: requestId, text, at: now(), seen: new Set(state.events.map((e) => e.id)) }];
    forceBottom = true;
    state.draft = '';
    render();
    try {
      const r = await api.send(sessionBase(s.id), { sessionId: s.id, text, requestId, ...(files.length ? { files } : {}) });
      // В очередь — его покажет блок очереди, пузырь не нужен.
      if (r?.queued) state.pending = state.pending.filter((p) => p.id !== requestId);
      state.draft = '';
      state.files = [];
      store.set(`draft:${s.id}`, '');
      forceBottom = true;
      syncClosing();
    } catch (e) {
      // «не доставлено · повторить» у сообщения: набранное не пропадает.
      state.pending = state.pending.filter((p) => p.id !== requestId);
      state.failed = [...state.failed, { id: requestId, text, files, error: e.message }];
      state.draft = '';
      state.files = [];
    } finally {
      state.sending = false;
      render();
    }
  }

  // Ветка и сводка правок (FR-008, FR-013): нет git или сбой — просто нечего показывать.
  async function loadDiff(id, fresh = false) {
    try {
      // После хода — мимо кеша моста: правки только что изменились.
      const r = await api.diff(sessionBase(id), id, fresh);
      if (state.openId !== id) return;
      state.diff = r?.git ? r : null;
    } catch { if (state.openId === id) state.diff = null; }
    render();
  }

  // Статус Anthropic (FR-009): раз в 2 минуты и только пока аппа на экране — свёрнутая
  // не жжёт трафик; вернулись (activated) — спрашиваем сразу.
  async function pollStatus(base) {
    if (!alive || tg?.isActive === false) return;
    try {
      const r = await api.anthropicStatus(base);
      state.status = r?.status && r.status.level !== 'ok' ? r.status : null;
    } catch { state.status = null; }
    render();
  }

  // «Показать раньше» (FR-005): порция до самого раннего показанного события.
  async function earlier() {
    const s = opened();
    const first = state.events[0];
    if (!s || !first || state.earlier.busy) return;
    state.earlier = { busy: true };
    render();
    // Пока ждали порцию, человек мог уйти в другой чат — тогда ответ уже ничей (ревью 014).
    const token = feedToken;
    const stale = () => token !== feedToken || state.openId !== s.id;
    try {
      const r = await api.before(sessionBase(s.id), s.id, first.id);
      if (stale()) return;
      const known = new Set(state.events.map((e) => e.id));
      const feed = root.querySelector('[data-role="feed"]');
      anchor = feed ? feed.scrollHeight - feed.scrollTop : null;
      state.events = [...(r.events ?? []).filter((e) => !known.has(e.id)), ...state.events];
      state.more = r.more === true;
      state.earlier = {};
    } catch (e) {
      if (stale()) return;
      // Ленту перечитали иначе (перезапуск моста) — якоря нет, открываем заново.
      if (e.code === 'cursor_lost') { state.earlier = {}; return openChat(s.id); }
      state.earlier = { error: e.message };
    }
    render();
  }

  async function resend(id) {
    const s = opened();
    const msg = state.failed.find((x) => x.id === id);
    if (!s || !msg) return;
    state.failed = state.failed.filter((x) => x.id !== id);
    render();
    try {
      await api.send(sessionBase(s.id), { sessionId: s.id, text: msg.text, requestId: msg.id, ...(msg.files?.length ? { files: msg.files } : {}) });
    } catch {
      state.failed = [...state.failed, msg];
    }
    render();
  }

  async function stop() {
    const s = opened();
    if (!s) return;
    state.stop = { state: 'busy' };
    haptic('heavy');
    render();
    try {
      const r = await api.stop(sessionBase(s.id), s.id);
      // Запасной путь терминала: Esc не дошёл, ход встанет на ближайшей команде — говорим прямо.
      if (r.via === 'hook') state.stop = { state: 'hint', message: r.hint || 'остановится перед следующей командой или правкой' };
      else if (!busy(opened())) state.stop = { state: 'done', at: new Date(now()).toISOString() };
    } catch (e) {
      state.stop = { state: 'fail', message: e.message === 'Мост не ответил' ? 'Не удалось остановить — мост не ответил' : `Не удалось остановить: ${e.message}` };
    }
    render();
  }

  async function decide(approvalId, verdict) {
    const s = opened();
    if (!s) return;
    state.deciding = { busy: true, verdict };
    haptic('medium');
    render();
    try {
      await api.decide(sessionBase(s.id), s.id, approvalId, verdict);
      haptic('success');
      state.deciding = null;
    } catch (e) {
      // Ответили в окне Shirabe или в личке — карточка закроется следующим кадром ленты.
      state.deciding = e.code === 'already_answered' ? null : { error: e.message === 'Мост не ответил' ? 'Мост не ответил' : e.message, verdict };
    }
    render();
  }

  async function answer(questionId) {
    const s = opened();
    if (!s) return;
    const own = root.querySelector('[data-role="own"]')?.value?.trim();
    const value = state.own ? (own ? [own] : []) : state.choice;
    if (!value.length) return;
    haptic('medium');
    try {
      await api.answer(sessionBase(s.id), s.id, questionId, value);
      haptic('success');
      state.choice = [];
      state.own = false;
    } catch (e) {
      if (e.code !== 'already_answered') state.netError = e.message;
    }
    render();
  }

  function choose(label) {
    const card = pendingCard(state.events);
    if (card?.kind !== 'question') return;
    state.own = false;
    haptic('select');
    if (card.event.multi) state.choice = state.choice.includes(label) ? state.choice.filter((x) => x !== label) : [...state.choice, label];
    else state.choice = [label];
    render();
  }

  async function unqueue(id) {
    const s = opened();
    if (!s) return;
    try { await api.cancelQueued(sessionBase(s.id), s.id, id); state.queue = state.queue.filter((m) => m.id !== id); } catch { /* уже ушло — лента покажет его */ }
    render();
  }

  async function loadProjects() {
    state.loadingProjects = true;
    render();
    const ms = state.machines.length ? state.machines : [solo];
    // Закрытые сессии — следом, а не вместе с проектами: их скан на машине идёт секундами, и
    // экран ждал бы его пустым.
    const closed = Promise.all(ms.map((m) => api.closed(m.url).then((c) => ({ m, c: c.sessions ?? [] }), () => ({ m, c: [] }))));
    const lists = await Promise.all(ms.map(async (m) => {
      const p = await api.projects(m.url).catch(() => ({ projects: [] }));
      return { m, p: p.projects ?? [], host: Boolean(p.host) };
    }));
    state.projectList = lists.flatMap(({ m, p }) => p.map((x) => ({ ...x, machine: m.id || undefined })));
    // Хост Shirabe на машине жив — сессию в любом её проекте можно завести в Shirabe.
    state.hostOn = Object.fromEntries(lists.map(({ m, host }) => [m.id, host]));
    for (const p of state.projectList) state.projects[p.id] = p;
    state.loadingProjects = false;
    render();
    state.closedList = (await closed).flatMap(({ m, c }) => c.map((x) => ({ ...x, machine: m.id || undefined })));
    render();
  }

  async function loadCatalog(base) {
    try {
      const c = await api.catalog(base);
      state.catalog = c;
      for (const a of c.accounts ?? []) state.accounts[a.id] = a;
    } catch { /* без каталога — модели вводятся словом */ }
  }

  async function openStart(projectId, source, machine, where) {
    const p = state.projectList.find((x) => x.id === projectId && (x.machine ?? '') === (machine ?? ''));
    await loadCatalog(baseOf(machine));
    const c = state.catalog?.catalog;
    // Где заводить: в Shirabe, если хост машины жив (там «Стоп» и карточки без обходов), иначе
    // в терминале IDE. Выбор — в листе; проект моста хосту годится — каталог даст мост.
    const canHost = Boolean(state.hostOn?.[machine ?? ''] ?? state.hostOn?.['']);
    const at = where ?? (canHost ? 'host' : 'terminal');
    const host = at === 'host';
    source = at;
    const agents = host ? (c?.agents ?? []).filter((a) => a.owned && a.enabled !== false && a.found !== false) : [{ id: 'claude-code', name: 'Claude Code' }];
    const agentId = agents[0]?.id ?? 'claude-code';
    const agent = (c?.agents ?? []).find((a) => a.id === agentId);
    const models = host ? (c?.models ?? []) : [];
    const accountsList = host ? (state.catalog?.accounts ?? []) : (state.catalog?.terminal?.accounts ?? []).map((id) => ({ id, label: id }));
    const features = state.catalog?.features ?? {};
    const prev = state.sheet?.kind === 'start' && state.sheet.projectId === projectId ? state.sheet : null;
    state.sheet = {
      kind: 'start', projectId, source, machine, projectName: p?.name ?? '', agents, agentId, agentProviders: agent?.providers,
      models, model: models.find((m) => !agent?.providers || agent.providers.includes(m.providerId))?.name, accountsList, accountId: accountsList[0]?.id,
      permission: prev?.permission ?? 'auto', first: prev?.first ?? '', requestId: prev?.requestId ?? random(), canHost, where: at,
      // 021: «Авто» и пометки локальных моделей — только где хост их умеет.
      canAuto: Boolean(host && features.auto), auto: Boolean(prev?.auto && host && features.auto), category: prev?.category ?? '',
    };
    render();
    if (state.sheet.auto) decideNow();
    if (host && features.local) void loadSheetLocal(state.sheet);
  }

  // 021: состояние Ollama машины — для пометок у локальных моделей в листе.
  async function loadSheetLocal(sh) {
    try {
      sh.local = await api.local(baseOf(sh.machine));
      if (state.sheet === sh) { keepSheet(sh); render(); }
    } catch { /* без состояния — без пометок */ }
  }

  // 021: выбранное в листе — в состояние до перерисовки: лист собирается заново.
  function keepSheet(sh) {
    const val = (r) => root.querySelector(`[data-role="${r}"]`)?.value;
    Object.assign(sh, {
      first: val('first') ?? sh.first, agentId: val('agent') ?? sh.agentId, accountId: val('account') ?? sh.accountId,
      permission: val('permission') ?? sh.permission, category: val('category') ?? sh.category,
    });
  }

  let decideTimer = null;
  // Решение — после паузы в вводе: по каждой букве классификатор хоста тратил бы лимит зря.
  function decideSoon() {
    clearTimeout(decideTimer);
    decideTimer = setTimeout(decideNow, autoPauseMs);
  }

  async function decideNow() {
    clearTimeout(decideTimer);
    const sh = state.sheet;
    if (sh?.kind !== 'start' || !sh.auto) return;
    const text = String(sh.first ?? '').trim();
    const key = decideKey(sh.projectId, sh.category, text);
    // Решение по этому ключу уже есть или уже запрошено — классификатор хоста не гоняем ещё раз.
    if (sh.decision?.key === key || (text && sh.deciding === key)) return;
    keepSheet(sh);
    sh.decision = undefined;
    sh.choice = undefined;
    sh.decideError = '';
    sh.deciding = text ? key : '';
    if (!text) return render();
    render();
    try {
      const d = await api.routingDecide(baseOf(sh.machine), { projectId: sh.projectId, text, ...(sh.category ? { category: sh.category } : {}) });
      // Текст или категория уже другие — ответ устарел (FR-004).
      if (state.sheet !== sh || decideKey(sh.projectId, sh.category, sh.first) !== key) return;
      sh.deciding = '';
      keepSheet(sh);
      const catalog = state.catalog?.catalog;
      // «Нет пары» или пара, которой нет в каталоге машины, — ручной выбор, а не молчаливый запуск.
      if (d.outcome === 'none' || (d.outcome === 'start' && !pairKnown(d.pair, catalog))) {
        keepSheet(sh);
        sh.auto = false;
        sh.autoNote = d.outcome === 'none' ? 'Мало данных для категории — выберите вручную' : 'Подобранной пары нет в каталоге этого компьютера — выберите вручную';
        return render();
      }
      sh.decision = { key, d };
      render();
    } catch (e) {
      if (state.sheet !== sh || decideKey(sh.projectId, sh.category, sh.first) !== key) return;
      sh.deciding = '';
      keepSheet(sh);
      sh.decideError = e.message;
      render();
    }
  }

  function setAuto(on) {
    const sh = state.sheet;
    if (sh?.kind !== 'start' || !sh.canAuto) return;
    keepSheet(sh);
    sh.auto = on;
    sh.autoNote = '';
    sh.manualFrom = undefined;
    render();
    if (on) decideNow();
  }

  // «Изменить»: ручной выбор с подставленной парой; решение остаётся у сессии ручным.
  function editDecision() {
    const sh = state.sheet;
    const d = sh?.decision?.d;
    if (!d) return;
    keepSheet(sh);
    const applied = applyChoice(d, d.choices?.[sh.choice]);
    const pair = applied.pair;
    const agent = (state.catalog?.catalog?.agents ?? []).find((a) => a.id === pair?.agentId);
    Object.assign(sh, {
      auto: false, manualFrom: applied, autoNote: '',
      ...(pair && pairKnown(pair, state.catalog?.catalog) ? { agentId: pair.agentId, agentProviders: agent?.providers, model: pair.model } : {}),
      ...(applied.accountId ? { accountId: applied.accountId } : {}),
    });
    render();
  }

  async function ollamaStart() {
    const sh = state.sheet;
    if (sh?.kind !== 'start' || sh.ollamaBusy) return;
    keepSheet(sh);
    sh.ollamaBusy = true;
    render();
    try {
      await api.localAction(baseOf(sh.machine), 'start');
      await loadSheetLocal(sh);
    } catch (e) { sh.error = e.message; }
    sh.ollamaBusy = false;
    if (state.sheet === sh) render();
  }

  // 020: модель и effort идущей сессии Shirabe — из каталога её машины.
  async function openModel() {
    const s = opened();
    if (!s || s.source !== 'host') return;
    await loadCatalog(sessionBase(s.id));
    const agent = (state.catalog?.catalog?.agents ?? []).find((a) => a.id === s.agentId);
    const models = (state.catalog?.catalog?.models ?? []).filter((m) => !agent?.providers || agent.providers.includes(m.providerId));
    state.sheet = { kind: 'model', sessionId: s.id, models, model: s.model, effort: s.effort };
    render();
  }

  async function modelGo() {
    const sh = state.sheet;
    const s = opened();
    if (!sh || sh.busy || !s) return;
    const model = root.querySelector('[data-role="cfg-model"]')?.value ?? sh.model;
    const effort = root.querySelector('[data-role="cfg-effort"]')?.value ?? '';
    const change = { ...(model && model !== s.model ? { model } : {}), ...(effort && effort !== s.effort ? { effort } : {}) };
    if (!Object.keys(change).length) { state.sheet = null; return render(); }
    sh.busy = true;
    sh.error = '';
    render();
    try {
      await api.configure(sessionBase(s.id), { sessionId: s.id, ...change });
      haptic('success');
      // Шапку обновит событие хоста; до него показываем выбранное — ответ уже «готово».
      Object.assign(s, change);
      state.sheet = null;
    } catch (e) {
      sh.busy = false;
      sh.error = e.message;
    }
    render();
  }

  async function startNow() {
    const s = opened();
    if (!s || state.startingNow) return;
    state.startingNow = true;
    render();
    try { await api.startNow(sessionBase(s.id), s.id); } catch (e) { state.netError = e.message; }
    state.startingNow = false;
    render();
  }

  const onlyEffort = (sh, model) => { const e = (sh.models ?? []).find((m) => m.name === model)?.efforts ?? []; return e.length === 1 ? e[0] : ''; };

  async function startGo() {
    const sh = state.sheet;
    if (!sh || sh.busy) return;
    // Всё из листа — до перерисовки: render() пересобирает лист, и выбранное сбросилось бы на
    // значения по умолчанию (права, аккаунт и effort уходили не те, что выбрал владелец).
    const pick = Object.fromEntries(['agent', 'model', 'account', 'permission', 'effort', 'first', 'category'].map((role) => [role, root.querySelector(`[data-role="${role}"]`)?.value ?? '']));
    // 021: «Авто» — пара и аккаунт из решения хоста (с выбранным вариантом).
    const auto = sh.auto && sh.decision ? applyChoice(sh.decision.d, sh.decision.d.choices?.[sh.choice]) : null;
    // Текст правили, а пауза до нового решения не вышла: решение — по прежнему тексту (FR-004).
    if (sh.auto && sh.decision && sh.decision.key !== decideKey(sh.projectId, pick.category || sh.category, pick.first)) {
      sh.first = pick.first;
      return void decideNow();
    }
    if (sh.auto && (!auto || autoBlocked(pick.first, sh.decision?.d, sh.decision?.d.choices?.[sh.choice]))) return;
    const agentId = auto?.pair?.agentId ?? (pick.agent || sh.agentId);
    // Модель — из состояния листа: оно обновляется на каждое изменение выбора (onChange).
    const model = auto ? auto.pair?.model : sh.model || pick.model;
    const providerId = auto ? auto.pair?.providerId : (sh.models ?? []).find((m) => m.name === model)?.providerId;
    const accountId = auto ? auto.accountId : pick.account;
    const routing = auto ?? (sh.manualFrom ? manualDecision(sh.manualFrom, { agentId, providerId, model, accountId: pick.account || undefined }) : null);
    sh.busy = true;
    sh.error = '';
    sh.first = pick.first;
    render();
    try {
      const r = await api.start(baseOf(sh.machine), {
        requestId: sh.requestId, projectId: sh.projectId, source: sh.source, agentId,
        ...(providerId && { providerId }), ...(model && { model }),
        ...(accountId && { accountId }), permission: pick.permission || 'auto',
        ...(routing && { routing }),
        // Effort модели один — поля нет, уходит он (иначе хост подставил бы medium).
        ...((pick.effort || onlyEffort(sh, model)) && { effort: pick.effort || onlyEffort(sh, model) }),
        ...(pick.first.trim() && { text: pick.first.trim() }),
      });
      // CLI терминала спросил, доверять ли папке: без ответа сессия не заведётся (FR-022).
      if (r.needsTrust?.token) {
        state.sheet = { kind: 'trust', token: r.needsTrust.token, source: sh.source, machine: sh.machine, projectName: sh.projectName };
        return render();
      }
      state.sheet = null;
      if (r.session?.id) {
        sessionsBy.set(sh.machine ?? '', [...(sessionsBy.get(sh.machine ?? '') ?? []).filter((x) => x.id !== r.session.id), { ...r.session, source: sh.source }]);
        mergeLists();
        openChat(r.session.id);
        return;
      }
      state.screen = 'sessions';
    } catch (e) {
      sh.busy = false;
      sh.error = e.hint ? `${e.message} — ${e.hint}` : e.message;
    }
    render();
  }

  // «Из сводки» или «Целиком» (FR-021) — если источник умеет оба; иначе сразу.
  function askResume(id, source, machine) {
    const c = state.closedList.find((x) => x.id === id && (x.machine ?? '') === (machine ?? ''));
    if ((c?.resumeModes?.length ?? 0) > 1) {
      state.sheet = { kind: 'resume', id, source, machine, title: c.title, tokens: c.tokens };
      return render();
    }
    return void resume(id, source, machine);
  }

  // Лист закрыли жестом. У вопроса о доверии это ответ «нет»: иначе вкладка IDE так и
  // висела бы на вопросе CLI, а человек запускал бы сессию ещё раз (ревью 014).
  function dismissSheet() {
    if (state.sheet?.kind === 'trust' && !state.sheet.busy) return void trustGo(false);
    state.sheet = null;
    render();
  }

  async function trustGo(yes) {
    const sh = state.sheet;
    if (sh?.kind !== 'trust' || sh.busy) return;
    sh.busy = true;
    render();
    try {
      await api.trust(baseOf(sh.machine), { source: sh.source, token: sh.token, trust: yes });
      state.sheet = null;
      state.notice = yes ? 'Папке доверились — сессия появится в списке через несколько секунд' : 'Сессия не запущена: папке не доверились';
      if (yes) state.screen = 'sessions';
    } catch (e) {
      sh.busy = false;
      sh.error = e.message;
    }
    render();
  }

  async function resume(id, source, machine, mode) {
    state.sheet = null;
    const title = state.closedList.find((x) => x.id === id)?.title || id.slice(0, 8);
    try {
      const r = await api.resume(baseOf(machine), id, source, mode);
      if (r.session?.id) { openChat(r.session.id); return; }
      // Терминал продолжает новой вкладкой IDE — сессия появится в списке сама (FR-021).
      state.notice = `Продолжаю «${title}»${mode === 'summary' ? ' из сводки — сначала сожму историю' : ''} — сессия появится в списке`;
      state.screen = 'sessions';
    } catch (e) {
      // Ошибка — там, где нажали: на «Проектах» баннера сети нет.
      state.notice = `Не удалось продолжить «${title}»: ${e.message}`;
    }
    render();
  }

  async function renameGo() {
    const s = opened();
    const name = root.querySelector('[data-role="name"]')?.value?.trim() ?? '';
    if (!s) return;
    try {
      await api.rename(sessionBase(s.id), s.id, name);
      state.sheet = null;
    } catch (e) {
      state.sheet = { ...state.sheet, error: e.message };
    }
    render();
  }

  // Закрыть с карточки (FR-020): у работающей сессии — предупреждение, что ход оборвётся.
  function askClose(id) {
    const s = state.sessions.find((x) => x.id === id);
    if (!s) return;
    const message = `Закрыть сессию «${s.title || id.slice(0, 8)}»?${busy(s) ? ' Ход оборвётся' : ''}`;
    if (tg?.showConfirm && supports('6.2')) {
      tg.showConfirm(message, (ok) => { if (ok) void closeById(id); });
      return;
    }
    state.sheet = { kind: 'close', id, message };
    render();
  }

  async function closeById(id) {
    state.sheet = null;
    try {
      await api.close(sessionBase(id), id);
      haptic('success');
    } catch (e) { state.netError = e.message; }
    render();
  }

  async function closeSession() {
    const s = opened();
    if (!s) return;
    state.sheet = null;
    try { await api.close(sessionBase(s.id), s.id); closeChat(); } catch (e) { state.netError = e.message; }
    render();
  }

  // 021: что умеет хост каждой машины — строка «Локальные модели» и вкладки экрана по ним.
  async function loadFeatures() {
    const ms = state.machines.length ? state.machines : [solo];
    const got = await Promise.all(ms.map((m) => api.catalog(m.url).then((c) => [m.id, c.features ?? null], () => [m.id, null])));
    state.featuresBy = Object.fromEntries(got);
  }

  // 021: экран «Локальные модели» — опрос раз в 2,5 с, пока экран открыт и мини-аппа видима.
  const LOCAL_POLL_MS = 2500;
  let localToken = 0;
  function closeLocal() { localToken++; }

  async function openLocal() {
    const token = ++localToken;
    await loadFeatures();
    // Пока читали, владелец ушёл с «Настроек» — экран моделей поверх его выбора не открываем.
    if (!alive || token !== localToken || state.screen !== 'settings') return;
    const ms = localMachines(state);
    if (!ms.length) return render();
    state.localTab = ms.some((m) => m.id === state.machineTab) ? state.machineTab : ms[0].id;
    state.screen = 'local';
    render();
    for (;;) {
      if (!alive || token !== localToken) return;
      await whenShown();
      if (!alive || token !== localToken) return;
      await refreshLocal(state.localTab);
      await sleep(LOCAL_POLL_MS);
    }
  }

  async function refreshLocal(id) {
    const m = (state.machines.length ? state.machines : [solo]).find((x) => x.id === id) ?? solo;
    const slot = (state.localBy[id] ??= {});
    try {
      slot.state = await api.local(m.url);
      slot.error = '';
      slot.down = false;
    } catch (e) {
      slot.error = e.message;
      slot.down = e.code === 'host_unavailable';
    }
    if (state.screen === 'local') render();
  }

  async function localAct(action, model) {
    const id = state.localTab;
    const slot = (state.localBy[id] ??= {});
    if (slot.busy) return;
    if (action === 'delete') {
      // Удаление — только через подтверждение с именами сессий на этой модели (FR-008).
      const used = (slot.state?.models ?? []).find((x) => x.name === model)?.usedBy ?? [];
      const sessions = used.map((sid) => state.sessions.find((s) => s.id === sid)?.title || sid.slice(0, 8));
      state.sheet = { kind: 'local-delete', model, machine: id, sessions };
      return render();
    }
    return void runLocal(id, action, model);
  }

  async function runLocal(id, action, model) {
    const m = (state.machines.length ? state.machines : [solo]).find((x) => x.id === id) ?? solo;
    const slot = (state.localBy[id] ??= {});
    slot.busy = model && action !== 'pull' ? model : action;
    slot.actError = '';
    render();
    try {
      await api.localAction(m.url, action, model);
      if (action === 'pull') state.pullName = '';
    } catch (e) {
      slot.actError = e.message;
    }
    slot.busy = '';
    await refreshLocal(id);
  }

  function localPull() {
    const name = String(root.querySelector('[data-role="pull-name"]')?.value ?? '').trim();
    state.pullName = name;
    const slot = (state.localBy[state.localTab] ??= {});
    // Имя проверяем до запроса — тем же правилом, что мост и хост.
    if (!/^[\w./-]+(:[\w.-]+)?$/.test(name) || name.includes('..')) {
      slot.actError = 'Имя модели — вида «имя:тег», например qwen3:14b';
      return render();
    }
    return void runLocal(state.localTab, 'pull', name);
  }

  async function loadSettings() {
    void loadFeatures().then(() => { if (state.screen === 'settings') render(); });
    const base = baseOf(state.machineTab) || state.machines[0]?.url || '';
    try {
      const [s, a] = await Promise.all([api.settings(base), api.about(base).catch(() => null)]);
      state.settings = s.settings ?? {};
      if (a) state.about = ['мост ' + (a.version || '—'), a.cli ? `claude ${a.cli}` : '', (state.machineTab === 'all' ? state.machines[0]?.id : state.machineTab) || ''].filter(Boolean).join(' · ');
    } catch (e) {
      state.netError = e.message;
    }
    render();
  }

  async function toggle(key) {
    const next = !state.settings[key];
    state.settings = { ...state.settings, [key]: next };
    state.settingsBusy = { ...state.settingsBusy, [key]: true };
    state.settingsError = '';
    state.settingsNote = '';
    render();
    // 020: пуши — настройка каждой машины; переключатель меняет её на всех машинах телефона.
    const ms = state.machines.length ? state.machines : [{ id: '', url: baseOf(state.machineTab) || '' }];
    const res = await Promise.all(ms.map((m) => api.patchSettings(m.url, { [key]: next }).then((r) => ({ m, r }), () => ({ m, r: null }))));
    const ok = res.filter((x) => x.r);
    if (!ok.length) {
      // Переключатель возвращается, строка говорит, что не сохранилось (SettingRow).
      state.settings = { ...state.settings, [key]: !next };
      state.settingsError = key;
    } else {
      state.settings = ok[0].r.settings ?? state.settings;
      const miss = res.filter((x) => !x.r).map((x) => x.m.name ?? x.m.id).filter(Boolean);
      if (miss.length) state.settingsNote = `На ${miss.join(', ')} не применилось — компьютер не ответил`;
    }
    state.settingsBusy = { ...state.settingsBusy, [key]: false };
    render();
  }

  async function attach() {
    const input = root.ownerDocument.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => void addFiles([...(input.files ?? [])]);
    input.click();
  }

  // Скрепка и вставка из буфера (FR-016). Тот же файл второй раз не прикрепляем: вставка
  // скриншота дважды подряд — частая случайность.
  async function addFiles(list) {
    for (const file of list) {
      const data = await readAsDataUrl(file);
      if (state.files.some((x) => x.data === data)) continue;
      state.files = [...state.files, { name: pastedName(file, new Date(now())), size: file.size, data, preview: file.type.startsWith('image/') ? data : '' }];
    }
    syncClosing();
    render();
  }

  function onPaste(ev) {
    if (ev.target?.dataset?.role !== 'draft') return;
    const cd = ev.clipboardData;
    const files = cd?.files?.length ? [...cd.files] : [...(cd?.items ?? [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean);
    if (!files.length) return; // текст вставляется как обычно
    ev.preventDefault();
    void addFiles(files);
  }

  // Копирование (FR-002–FR-004): итог — на самой кнопке, на 1,5 с. Не вышло — выделяем
  // текст, чтобы скопировать его системным меню.
  async function copy(btn, text, node) {
    const ok = await copyText(text ?? '');
    haptic(ok ? 'success' : 'error');
    // innerHTML, а не textContent: у кнопки реплики внутри иконка, и текстом она бы стёрлась.
    const label = btn.innerHTML;
    const word = ok ? 'Скопировано' : 'Не удалось скопировать';
    if (btn.classList.contains('tb-copy')) btn.setAttribute('aria-label', word);
    else btn.textContent = word;
    btn.classList.toggle('is-done', ok);
    if (!ok && node) { try { root.ownerDocument.defaultView.getSelection()?.selectAllChildren(node); } catch { /* выделить нечем */ } }
    setTimeout(() => { btn.innerHTML = label; btn.classList.remove('is-done'); btn.setAttribute('aria-label', 'Копировать'); }, 1500);
  }

  // Ссылка из ответа — во внешнем браузере через Telegram, а не поверх мини-аппы.
  function openLink(url) {
    if (tg?.openLink) tg.openLink(url);
    else root.ownerDocument.defaultView?.open?.(url, '_blank', 'noopener');
  }

  function absolute(url) {
    try { return new URL(url, root.ownerDocument.location?.href).href; } catch { return url; }
  }

  // Скачать файл (8.0+): Telegram сам сохранит его в «Загрузки»; без этого — открыть ссылкой.
  async function download(url, name) {
    const file = blobOf.get(url) ?? url;
    if (parseFileUrl(file)) {
      try { url = await keyed(file, true); } catch (e) { state.netError = e.status === 404 ? 'Файла уже нет на диске' : e.message; return render(); }
      // Вне Telegram — переходом по ссылке: с download=1 мост отдаёт вложение, страница остаётся.
      if (pwa) {
        const a = root.ownerDocument.createElement('a');
        a.href = url;
        a.rel = 'noopener';
        a.click();
        return;
      }
    }
    const abs = absolute(url);
    if (tg?.downloadFile && supports('8.0')) {
      try { tg.downloadFile({ url: abs, file_name: name }); return; } catch { /* старый клиент */ }
    }
    openLink(abs);
  }

  function legacy() {
    const s = opened();
    loc.href = `legacy/index.html${s ? `?sid=${encodeURIComponent(s.id)}` : ''}`;
  }

  // --- разбор нажатий -----------------------------------------------------------
  function onClick(ev) {
    // Записанный агентом файл в строке инструмента — ссылка <a>: тоже через ключ (#79).
    const a = ev.target.closest?.('a[href]');
    if (a && root.contains(a) && parseFileUrl(a.getAttribute('href'))) { ev.preventDefault(); return void openFile(a.getAttribute('href')); }
    const el = ev.target.closest?.('[data-act]');
    if (!el || !root.contains(el)) return;
    const d = el.dataset;
    // По подложке листа — закрыть; по самому листу — нет.
    if (d.act === 'sheet-close' && el.classList.contains('tb-scrim') && ev.target !== el) return;
    switch (d.act) {
      case 'copy-code': { const pre = el.closest('.tb-cb')?.querySelector('pre'); return void copy(el, pre?.textContent ?? '', pre); }
      case 'copy-msg': return void copy(el, state.events.find((e) => e.id === d.id)?.text ?? '', el.closest('.tb-me, .tb-claude'));
      case 'expand': state.expanded.add(d.key); return render();
      case 'earlier': return void earlier();
      case 'outage': state.sheet = { kind: 'outage' }; return render();
      case 'diff': state.screen = 'diff'; return render();
      case 'diff-close': state.screen = 'chat'; return render();
      case 'to-last': forceBottom = true; state.unseen = 0; return render();
      case 'link': ev.preventDefault(); return parseFileUrl(d.url) ? void openFile(d.url) : openLink(d.url);
      case 'download': return void download(d.url, d.name);
      case 'install': return void installApp();
      case 'back':
        // Чат открыт шагом истории — снимаем его, а закроет чат popstate; иначе — сразу.
        if (pwa && history?.state?.ctbChat) { history.back(); return; }
        return back();
      case 'pwa-copy-link': {
        const m = phone[0];
        return void (m && copy(el, linkOf(m, `${root.ownerDocument.defaultView?.location?.origin ?? ''}${root.ownerDocument.defaultView?.location?.pathname ?? ''}`), null));
      }
      case 'nav':
        state.notice = '';
        // 021: ушли с экрана моделей — его опрос прекращается.
        closeLocal();
        if (d.to === 'sessions') { closeChat(); state.screen = 'sessions'; }
        else { state.screen = d.to; if (d.to === 'projects') void loadProjects(); if (d.to === 'settings') void loadSettings(); }
        return render();
      case 'machine':
        // 021: на экране моделей вкладка — машина экрана, «Все» там нет.
        if (state.screen === 'local') { state.localTab = d.id; render(); return void refreshLocal(d.id); }
        state.machineTab = d.id; store.set('bridge-machine-tab', d.id); return render();
      case 'local-open': return void openLocal();
      case 'local-act': return void localAct(d.a, d.m);
      case 'local-pull': return localPull();
      case 'local-delete-go': { const sh = state.sheet; state.sheet = null; return void runLocal(sh.machine, 'delete', sh.model); }
      case 'open': return openChat(d.id);
      case 'retry': if (state.deviceLost) return void reconnect(); state.netError = ''; return render();
      case 'send': return void send();
      case 'resend': return void resend(d.id);
      case 'stop': return askStop();
      case 'stop-go': state.sheet = null; return void stop();
      case 'decide': return void decide(d.id, d.verdict);
      case 'choose': return choose(d.label);
      case 'own': state.own = true; state.choice = []; return render();
      case 'answer': return void answer(d.qid);
      case 'unqueue': return void unqueue(d.id);
      case 'attach': return void attach();
      case 'unattach': state.files = state.files.filter((_, i) => i !== Number(d.i)); syncClosing(); return render();
      case 'menu': state.sheet = { kind: 'menu' }; return render();
      case 'model': return void openModel();
      case 'model-go': return void modelGo();
      case 'start-now': return void startNow();
      case 'rename': state.sheet = { kind: 'rename', name: opened()?.title ?? '' }; return render();
      case 'rename-go': return void renameGo();
      case 'close-session': return void closeSession();
      case 'close-card': return askClose(d.id);
      case 'close-go': return void closeById(d.id);
      case 'legacy': return legacy();
      case 'sheet-close': return dismissSheet();
      case 'start': return void openStart(d.id, d.source, d.machine);
      case 'start-go': return void startGo();
      case 'auto': return setAuto(d.v === '1');
      case 'auto-choice': if (state.sheet?.decision) { keepSheet(state.sheet); state.sheet.choice = Number(d.i); render(); } return;
      case 'auto-edit': return editDecision();
      case 'ollama-start': return void ollamaStart();
      case 'resume': return askResume(d.id, d.source, d.machine);
      case 'resume-go': { const sh = state.sheet; return void resume(sh.id, sh.source, sh.machine, d.mode); }
      case 'trust-go': return void trustGo(d.yes === '1');
      case 'view': state.viewer = { src: d.src, name: d.name }; return render();
      case 'viewer-close': state.viewer = null; return render();
      case 'theme': state.theme = d.v === 'console' ? 'console' : 'tg'; store.set('bridge-theme', state.theme); applyTheme(); return render();
      case 'toggle': return void toggle(d.key);
      default:
    }
  }
  // «Где» в листе новой сессии меняет агентов, модели и аккаунты — лист собирается заново.
  function onChange(ev) {
    const sh = state.sheet;
    const role = ev.target?.dataset?.role;
    // 020: другая модель — другой набор effort; набранное первое сообщение не теряем.
    if ((role === 'model' && sh?.kind === 'start') || (role === 'cfg-model' && sh?.kind === 'model')) {
      sh.model = ev.target.value;
      // Поле модели словом (каталога нет) — набор effort не меняется, перерисовка стёрла бы ввод.
      if (ev.target.tagName !== 'SELECT') return;
      // Перерисовка пересобирает лист: всё выбранное — в состояние, иначе вернулось бы по умолчанию.
      const val = (r) => root.querySelector(`[data-role="${r}"]`)?.value;
      if (sh.kind === 'start') Object.assign(sh, { first: val('first') ?? sh.first, agentId: val('agent') ?? sh.agentId, accountId: val('account') ?? sh.accountId, permission: val('permission') ?? sh.permission });
      return render();
    }
    // 021: другой агент — другие провайдеры: список моделей и выбранная модель — его (у OpenCode —
    // локальные, у Claude Code — Anthropic), иначе уходила бы пара, которую агент не умеет.
    if (role === 'agent' && sh?.kind === 'start') {
      keepSheet(sh);
      const agent = (state.catalog?.catalog?.agents ?? []).find((a) => a.id === sh.agentId);
      sh.agentProviders = agent?.providers;
      const fits = (m) => !agent?.providers || agent.providers.includes(m.providerId);
      if (!(sh.models ?? []).some((m) => m.name === sh.model && fits(m))) sh.model = (sh.models ?? []).find(fits)?.name;
      return render();
    }
    // 021: категория — другой ключ решения: пересчитываем сразу, без паузы.
    if (role === 'category' && sh?.kind === 'start') { sh.category = ev.target.value; return void decideNow(); }
    if (role !== 'where' || sh?.kind !== 'start') return;
    keepSheet(sh);
    void openStart(sh.projectId, sh.source, sh.machine, ev.target.value);
  }

  function onInput(ev) {
    // 021: задача «Авто» — в состояние без перерисовки (курсор не прыгает), решение — после паузы.
    if (ev.target?.dataset?.role === 'first' && state.sheet?.kind === 'start') {
      state.sheet.first = ev.target.value;
      if (state.sheet.auto) decideSoon();
      return;
    }
    // 021: имя модели для скачивания — опрос экрана перерисовывает его каждые 2,5 с.
    if (ev.target?.dataset?.role === 'pull-name') { state.pullName = ev.target.value; return; }
    if (ev.target?.dataset?.role !== 'draft') return;
    state.draft = ev.target.value;
    if (state.openId) store.set(`draft:${state.openId}`, state.draft);
    syncClosing();
    // Кнопка «Отправить» оживает без перерисовки всего экрана — фокус и клавиатура остаются.
    const btn = root.querySelector('[data-act="send"]');
    const can = Boolean(state.draft.trim() || state.files.length) && !state.sending;
    if (btn) { btn.disabled = !can; btn.classList.toggle('is-disabled', !can); }
  }

  // Таймер хода — тикает текстом, не перерисовкой: иначе поле ввода теряло бы набор.
  function tick() {
    const el = root.querySelector('.tb-work .tmr');
    const t0 = turnStart(state.events);
    if (el && t0) el.textContent = timer(now() - Date.parse(t0));
  }

  // --- вне Telegram (016) -----------------------------------------------------------
  // Экран «Компьютер не подключён» с полем для ссылки. Верная ссылка — машина сохранена, true.
  function waitForLink() {
    const st = { phase: 'none', error: '' };
    const draw = () => { root.innerHTML = connectScreen(st); TgBridge?.hydrate?.(root); };
    draw();
    return new Promise((resolve) => {
      const tryLink = async (text) => {
        const m = await machinesDb.adoptText(text).catch(() => null);
        if (!m) { st.error = 'Это не ссылка подключения — скопируйте её в Safari: «Настройки» → «Скопировать ссылку для приложения»'; draw(); return; }
        root.removeEventListener('click', onClick);
        // Сначала убрать клавиатуру — потом менять экран: иначе iOS не вернёт высоту окна.
        /** @type {HTMLElement | null} */ (root.ownerDocument.activeElement)?.blur?.();
        resolve(true);
      };
      const onClick = async (ev) => {
        const act = /** @type {HTMLElement} */ (ev.target).closest?.('[data-act]')?.getAttribute('data-act');
        const input = /** @type {HTMLInputElement | null} */ (root.querySelector('[data-role="link"]'));
        if (act === 'pwa-link') return tryLink(input?.value ?? '');
        if (act === 'pwa-paste') {
          // Чтение буфера — только по нажатию и в secure context; нет доступа — вставят руками.
          const text = await globalThis.navigator?.clipboard?.readText?.().catch(() => '') ?? '';
          if (!text) { st.error = 'Буфер не прочитался — вставьте ссылку в поле руками'; return draw(); }
          return tryLink(text);
        }
      };
      root.addEventListener('click', onClick);
    });
  }

  // Открыта в браузере, а установить можно, — показываем только установку (решение владельца:
  // в браузере мост ни к чему). Нечего ставить (Android по http) — работаем в браузере.
  const inBrowser = () => Boolean(install?.standalone) && !install.standalone();
  function installGate(link) {
    const kind = installKind() || (install?.ios?.() ? 'ios' : 'menu');
    const nav = globalThis.navigator;
    const st = { phase: 'install', kind, link, copied: false, guide: guideFor(nav?.userAgent, nav?.language, { canPrompt: kind === 'prompt', touch: nav?.maxTouchPoints, ios: kind === 'ios' }) };
    const draw = () => { root.innerHTML = connectScreen(st); TgBridge?.hydrate?.(root); };
    draw();
    root.addEventListener('click', async (ev) => {
      const act = /** @type {HTMLElement} */ (ev.target).closest?.('[data-act]')?.getAttribute('data-act');
      if (act === 'pwa-gate-install') { await installApp(); st.kind = installKind() || st.kind; draw(); }
      if (act === 'pwa-gate-copy' && st.link) {
        try { await globalThis.navigator?.clipboard?.writeText?.(st.link); st.copied = true; } catch { /* нет буфера — ссылка видна в QR */ }
        draw();
      }
    });
  }

  async function pwaBoot() {
    // Без secure context (ZeroTier по http) установки и уведомлений нет — прячем, а не роняем.
    root.ownerDocument.documentElement.classList.toggle('no-secure', !secure);
    // Ссылку из QR запоминаем до того, как adopt сотрёт её из адреса: её переносят в приложение.
    const qrLink = loc?.hash && /[#&]m=/.test(loc.hash) ? `${loc.origin ?? ''}${loc.pathname ?? ''}${loc.hash}` : '';
    let adopted = null;
    try { adopted = await machinesDb.adopt(); } catch { /* хранилище недоступно — без новой машины */ }
    if (inBrowser() && (secure || install?.ios?.())) {
      const known = adopted ?? (await machinesDb.list().catch(() => []))[0] ?? null;
      const page = `${loc?.origin ?? ''}${loc?.pathname ?? ''}`;
      installGate(qrLink || (known ? linkOf(known, page) : ''));
      return false;
    }
    const all = await machinesDb.list().catch(() => []);
    if (!all.length) {
      // Машины нет — ждём ссылку: QR (новая загрузка страницы) или вставку руками.
      const pasted = await waitForLink();
      if (!pasted) return false;
      return pwaBoot();
    }
    const ok = [];
    for (const m of all) if (await device.has(slotOf(m)).catch(() => false)) ok.push(m);
    // Свежий QR новой машины — подключаем её; ни одной разрешённой — первую из известных.
    const need = adopted && !ok.some((m) => m.id === adopted.id) ? adopted : ok.length ? null : all[0];
    if (need) {
      const owner = await new Promise((resolve) => {
        const c = createConnect({ root, fetch: f, device, machine: need, onApproved: (_m, o) => { c.stop(); resolve(o ?? null); } });
        c.start();
      });
      if (owner) await adoptOwner(need, owner);
      else ok.push(need);
      // Машины владельца (018) пришли с разрешением — список заново, с их личными адресами.
      if (owner) for (const m of await machinesDb.list().catch(() => [])) if (!ok.some((x) => x.id === m.id) && await device.has(slotOf(m)).catch(() => false)) ok.push(m);
    }
    const toPhone = () => {
      phone = ok.map((m) => ({
        id: m.id, url: m.url, topic: m.topic ?? '', key: m.key ?? '',
        ...(m.ownerId ? { ownerId: m.ownerId } : {}), ...(m.grant ? { grant: m.grant } : {}),
        // 019: подпись — текущее имя машины; id — ключ хранилища и слота, после переименования прежний.
        ...(m.name ? { name: m.name } : {}), ...(m.uid ? { uid: m.uid } : {}),
      }));
    };
    // Список — до вопроса о соседях: запрос к машине подписывается ключом, найденным по нему.
    toPhone();
    await joinOwnerMachines(ok);
    toPhone();
    return true;
  }

  /**
   * 018: новый компьютер владельца появляется без новой привязки — его знает любая машина
   * владельца (реестр, сосед, записи Cloudflare). Спрашиваем первую ответившую; ключ — общий.
   */
  async function joinOwnerMachines(ok) {
    const owned = ok.filter((m) => m.ownerId && m.grant);
    for (const m of owned) {
      // Не дольше 3 с: машина владельца может спать, а вход ждёт.
      const r = await Promise.race([api.machinesAt(m.url).catch(() => null), sleep(3000).then(() => null)]);
      if (!r) continue;
      const list = (r.machines ?? []).filter((n) => n && typeof n.id === 'string' && /^https?:\/\//.test(n.url ?? ''));
      const selfUid = typeof r.selfUid === 'string' && r.selfUid ? r.selfUid : '';
      // 019: машина новой версии отдаёт uid — её список уже без мусора, и он главный. Но только
      // полный (complete: телефон разрешён, известные машины в нём есть) — иначе стёрли бы живые.
      const fresh = r.complete === true && Boolean(selfUid);
      const lower = (v) => String(v ?? '').toLowerCase();
      const clean = (u) => String(u).replace(/\/+$/, '');
      // По адресу склеиваем, только если он в списке один: общий домен у нескольких машин — не признак.
      const unique = (u) => list.filter((x) => clean(x.url) === clean(u)).length === 1;
      const seen = new Set();
      const update = async (x, patch) => {
        Object.assign(x, patch);
        await machinesDb.save(x).catch(() => {});
      };
      if (selfUid && m.uid !== selfUid) await update(m, { uid: selfUid });
      seen.add(m);
      for (const n of list) {
        // Та же машина: по uid; сама ответившая — по своему имени (self); старая запись — по имени или адресу.
        const same = (n.uid && ok.find((x) => x.uid === n.uid))
          || (!n.uid && r.self && lower(n.id) === lower(r.self) ? m : null)
          || ok.find((x) => (!x.uid || !n.uid) && (lower(x.name ?? x.id) === lower(n.id) || (unique(n.url) && x.url === clean(n.url))));
        if (same) {
          seen.add(same);
          // Переименовали — подпись новая, ключ хранилища и слот прежние (допуск не теряется).
          const name = lower(same.id) === lower(n.id) ? undefined : n.id;
          if ((same.name ?? undefined) !== name || (n.uid && same.uid !== n.uid)) await update(same, { ...(name ? { name } : { name: undefined }), ...(n.uid ? { uid: n.uid } : {}) });
          continue;
        }
        const entry = { id: n.id, url: n.url, ownerId: m.ownerId, grant: m.grant, ...(n.uid ? { uid: n.uid } : {}) };
        await machinesDb.save(entry).catch(() => {});
        ok.push(entry);
        seen.add(entry);
      }
      // Машины владельца, которых нет в списке новой версии, — удалённый мусор или забытые (019, US3).
      if (fresh) {
        const stale = ok.filter((x) => x.ownerId === m.ownerId && !seen.has(x));
        for (const x of stale) {
          await machinesDb.remove(x.id).catch(() => {});
          ok.splice(ok.indexOf(x), 1);
        }
      }
      return;
    }
  }

  /**
   * 018: разрешили на машине владельца — сохраняем все его машины с личными адресами (адрес из
   * QR был общим доменом) и отдаём каждой допуск: им не придётся просить «Разрешить» снова.
   */
  async function adoptOwner(need, owner) {
    const list = (owner.machines ?? []).filter((m) => m && typeof m.id === 'string' && /^https?:\/\//.test(m.url ?? ''));
    if (!list.some((m) => m.id === need.id)) list.push(need);
    for (const m of list) {
      const entry = { id: m.id, url: m.url, ...(m.topic ? { topic: m.topic } : {}), ...(m.key ? { key: m.key } : {}), ...(typeof m.uid === 'string' && m.uid ? { uid: m.uid } : {}), ownerId: owner.ownerId, grant: owner.grant };
      await machinesDb.save(entry).catch(() => {});
      void api.ownerGrant(entry.url, [owner.grant]).catch(() => { /* выключена — отдадим, когда не пустит */ });
    }
  }

  // 017: телефон рассказывает своим машинам друг о друге (share.js).
  const share = createShare({ machines: () => phone, send: (base, list) => api.shareMachines(base, list) });

  // Адрес машины не ответил (быстрый туннель перезапущен) — ищем новый в точке встречи.
  // Одна попытка на машину за раз и не чаще раза в 15 с: циклы списка и ленты падают
  // разом, и без этого каждый спрашивал бы ntfy сам.
  const quickTunnel = (u) => { try { return new URL(u).hostname.endsWith('.trycloudflare.com'); } catch { return false; } };
  const searching = new Map();
  const searchedAt = new Map();
  function relocate(base) {
    const m = phoneOf(base);
    if (!m?.topic || !m.key) return Promise.resolve(null);
    // Новый адрес ищем только для быстрого туннеля. Частный путь (ZeroTier, Tailscale) на
    // публичный не меняем: там другой пропуск и origin, и вернуться телефон уже не смог бы (ревью 016).
    if (!quickTunnel(m.url)) return Promise.resolve(null);
    if (searching.has(m.id)) return searching.get(m.id);
    if (now() - (searchedAt.get(m.id) ?? -Infinity) < 15_000) return Promise.resolve(null);
    searchedAt.set(m.id, now());
    state.searching = true;
    render();
    const p = (async () => {
      const r = await findAddress({ fetch: f, topic: m.topic, key: m.key, machineId: m.id, crypto });
      if (!r || r.url === m.url) return null;
      const old = m.url;
      for (const x of new Set([m, solo, ...state.machines])) if (x.url === old) x.url = r.url;
      await machinesDb.setUrl(m.id, r.url).catch(() => {});
      return r.url;
    })().catch(() => null).finally(() => {
      searching.delete(m.id);
      state.searching = searching.size > 0;
      render();
    });
    searching.set(m.id, p);
    return p;
  }

  async function reconnect() {
    await device.forget(state.deviceLost).catch(() => {});
    loc.reload?.();
  }

  // «Установить на главный экран» (US1 сц. 8): Android Chrome даёт событие beforeinstallprompt,
  // iOS Safari — только меню «Поделиться», о нём и говорим.
  function installKind() {
    // iPhone ставит на экран «Домой» и по http (ZeroTier) — проверено вживую (016); Android и
    // компьютер — только по HTTPS.
    if (!pwa || (!secure && !install?.ios?.())) return '';
    if (install?.standalone?.()) return '';
    if (install?.prompt?.()) return 'prompt';
    return install?.ios?.() ? 'ios' : '';
  }
  async function installApp() {
    const ev = install?.prompt?.();
    if (!ev) return;
    try { await ev.prompt(); } catch { /* человек закрыл окно установки */ }
    render();
  }

  // --- старт --------------------------------------------------------------------
  async function start() {
    tg?.ready?.();
    tg?.expand?.();
    // Безрамочный режим, как в старом мосте: без шапки Telegram (8.0+); кнопки клиента
    // ложатся поверх — под них отступ --tg-content-safe-area-* в app.css. Отказ
    // (десктоп) — не ошибка, остаёмся в обычном виде.
    if (supports('8.0')) tg?.requestFullscreen?.();
    // На весь экран легко «выпасть» вертикальным свайпом по ленте (7.7+).
    if (supports('7.7')) tg?.disableVerticalSwipes?.();
    // Заголовок уходит в полосу между кнопками клиента только на весь экран (FR-025).
    const syncFs = () => root.ownerDocument.documentElement.classList.toggle('fs', tg?.isFullscreen === true);
    syncFs();
    tg?.onEvent?.('fullscreenChanged', syncFs);
    tg?.onEvent?.('fullscreenFailed', syncFs);
    applyTheme();
    tg?.onEvent?.('themeChanged', applyTheme);
    tg?.BackButton?.onClick?.(back);
    // 020: «Настройки» из меню клиента Telegram — с любого экрана (Bot API 7.0+).
    if (supports('7.0') && tg?.SettingsButton) {
      tg.SettingsButton.onClick?.(() => { closeChat(); state.sheet = null; state.screen = 'settings'; void loadSettings(); render(); });
      tg.SettingsButton.show?.();
    }
    if (pwa) root.ownerDocument.defaultView?.addEventListener?.('popstate', () => { if (state.viewer || state.sheet || state.screen === 'chat' || state.screen === 'diff') back(); });
    // Вне Telegram сначала — какой компьютер и пущен ли сюда телефон; без разрешения данных нет.
    if (pwa && !(await pwaBoot())) return;
    // 017: телефон рассказывает своим компьютерам друг о друге — сразу и раз в 10 минут.
    if (pwa) share.start();
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('paste', onPaste);
    // Долистал до низа сам — счётчик «К последним» гаснет без перерисовки ленты.
    root.addEventListener('scroll', (ev) => {
      if (ev.target?.dataset?.role !== 'feed' || !state.unseen || !isAtBottom(ev.target)) return;
      state.unseen = 0;
      root.querySelector('[data-act="to-last"]')?.remove();
    }, true);
    render();
    if (pwa) {
      // Вкладки машин — машины телефона (FR-008), а не реестр моста: у телефона свой набор.
      state.machines = phone.length > 1 ? phone : [];
      solo.url = phone[0]?.url ?? '';
    } else {
      try {
        const r = await api.machines();
        state.machines = uniqueMachines(Array.isArray(r.machines) ? r.machines.filter((m) => m?.id && m?.url) : []);
      } catch { state.machines = []; }
    }
    // Две машины и больше — по умолчанию «Все» (FR-019); выбранную вкладку помним.
    if (state.machines.length > 1 && state.machineTab !== 'all' && !state.machines.some((m) => m.id === state.machineTab)) state.machineTab = 'all';
    const targets = state.machines.length > 1 ? state.machines : [solo];
    if (state.machines.length < 2) state.machines = [];
    for (const m of targets) void listLoop(m);
    void pollStatus(targets[0].url);
    statusTimer = setInterval(() => void pollStatus(targets[0].url), 120_000);
    tg?.onEvent?.('activated', () => void pollStatus(targets[0].url));
    void loadCatalog(targets[0].url);
    void api.projects(targets[0].url).then((r) => { for (const p of r.projects ?? []) state.projects[p.id] = p; render(); }).catch(() => {});
    // Ссылка из пуша бота: ?sid= — сразу в чат этой сессии.
    const sid = new URLSearchParams(loc?.search ?? '').get('sid') || tg?.initDataUnsafe?.start_param;
    if (sid) openChat(sid);
  }

  return { start, state, render, stopAll: () => { alive = false; feedToken++; clearInterval(statusTimer); share.stop(); }, tick, haptic };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Машины с одним адресом — одна машина: по адресу отвечает один туннель. Машина, знавшая себя
 * под прежним именем, отдавала обе записи (живой случай: pc2 и «mamoru» на pc2.mamoru.fun —
 * вторая вкладка и «Shirabe не отвечает на pc2, mamoru»). Остаётся запись с uid, иначе первая.
 */
export function uniqueMachines(list) {
  const key = (u) => String(u ?? '').trim().replace(/\/+$/, '').toLowerCase();
  const out = [];
  for (const m of list) {
    const i = out.findIndex((x) => key(x.url) === key(m.url));
    if (i < 0) out.push(m);
    else if (!out[i].uid && m.uid) out[i] = m;
  }
  return out;
}

// Скриншот из буфера приходит как image.png — у пачки таких имён не различить. Даём
// «Скриншот ЧЧ-ММ.png»; у настоящих файлов имя остаётся своим.
export function pastedName(file, at) {
  const name = String(file?.name ?? '');
  if (name && !/^(image|blob)(\.\w+)?$/i.test(name)) return name;
  const ext = (/^image\/(\w+)/.exec(file?.type ?? '')?.[1] ?? 'png').replace('jpeg', 'jpg');
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  return `Скриншот ${hh}-${mm}.${ext}`;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
