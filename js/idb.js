// Хранилище «ключ → объект» в IndexedDB `ctb` (data-model.md, «Телефон»). Ключ устройства
// кладётся объектом CryptoKey целиком: structured clone его сохраняет, а байты
// неизвлекаемого ключа странице недоступны — подменённая страница их не унесёт.

const STORES = ['keys', 'machines'];

function wrap(open) {
  let dbp;
  const db = () => (dbp ??= open());
  return (name) => {
    const tx = async (mode, fn) => {
      const d = await db();
      return new Promise((resolve, reject) => {
        const t = d.transaction(name, mode);
        const req = fn(t.objectStore(name));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      });
    };
    return {
      get: (k) => tx('readonly', (s) => s.get(k)),
      set: (k, v) => tx('readwrite', (s) => s.put(v, k)).then(() => undefined),
      del: (k) => tx('readwrite', (s) => s.delete(k)).then(() => undefined),
      all: () => tx('readonly', (s) => s.getAll()),
    };
  };
}

export function memoryStore(map = new Map()) {
  return {
    get: async (k) => map.get(k),
    set: async (k, v) => { map.set(k, v); },
    del: async (k) => { map.delete(k); },
    all: async () => [...map.values()],
  };
}

/** { keys, machines }. Без IndexedDB (приватное окно старого Safari) — в памяти: на сеанс. */
export function openStores(idb = globalThis.indexedDB) {
  if (!idb?.open) return { keys: memoryStore(), machines: memoryStore() };
  const store = wrap(() => new Promise((resolve, reject) => {
    const r = idb.open('ctb', 1);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
  return { keys: store('keys'), machines: store('machines') };
}
