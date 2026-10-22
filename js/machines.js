// Машины телефона (016, FR-008): каждая пришла ссылкой из QR трея
// `#m=<machineId>&u=<адрес моста>&t=<тема ntfy>&k=<ключ AES>` и лежит в IndexedDB.
// Ссылка доступа не даёт (это делает разрешение на компьютере), но тема и ключ
// открывают адрес — из адресной строки фрагмент стираем сразу после разбора.

const clean = (u) => String(u).replace(/\/+$/, '');

export function parseLink(hash) {
  const p = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  const id = p.get('m');
  const raw = p.get('u');
  if (!id || !raw) return null;
  let url;
  // Только http(s): адрес идёт в fetch и в ссылки на файлы, javascript: тут быть не должно.
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const m = { id, url: clean(url.href), topic: p.get('t') ?? '', key: p.get('k') ?? '' };
  // o= (018): машина владельца — ключ телефона общий для всех машин одного бота.
  const owner = p.get('o');
  return owner && /^[0-9a-f]{16}$/.test(owner) ? { ...m, ownerId: owner } : m;
}

/** Ссылка подключения машины — та же, что в QR трея: для переноса в приложение на iPhone. */
export function linkOf(m, page) {
  const q = new URLSearchParams({ m: m.id, u: m.url, t: m.topic ?? '', k: m.key ?? '', ...(m.ownerId ? { o: m.ownerId } : {}) });
  return `${String(page).replace(/#.*$/, '')}#${q.toString()}`;
}

/** Ссылка, вставленная руками: целиком (с адресом страницы) или только фрагмент. */
export function parsePasted(text) {
  const s = String(text ?? '').trim();
  const i = s.indexOf('#');
  return parseLink(i >= 0 ? s.slice(i) : s);
}

export function createMachines({ store, location: loc, history }) {
  const get = async (id) => (await store.get(id)) ?? null;
  async function save(m) {
    const prev = await get(m.id);
    const next = { ...prev, ...m, url: clean(m.url) };
    await store.set(m.id, next);
    return next;
  }
  return {
    get,
    save,
    list: async () => (await store.all()).filter((m) => m?.id && m?.url),
    remove: (id) => store.del(id),

    /** Ссылка в адресе → машина в хранилище; фрагмент стирается. Нет ссылки — null. */
    async adopt() {
      const m = parseLink(loc?.hash);
      if (!m) return null;
      // replaceState, а не location.hash = '': иначе в адресе остаётся «#», а в истории — шаг назад к ключу.
      try { history?.replaceState?.(null, '', `${loc.pathname ?? ''}${loc.search ?? ''}`); } catch { /* старый WebView */ }
      return save(m);
    },

    /** Вставленная ссылка → машина; неверная — null. */
    async adoptText(text) {
      const m = parsePasted(text);
      return m ? save(m) : null;
    },

    async setUrl(id, url) {
      const m = await get(id);
      if (m) await store.set(id, { ...m, url: clean(url) });
    },

    async markOk(id, at) {
      const m = await get(id);
      if (m) await store.set(id, { ...m, lastOkAt: at });
    },
  };
}
