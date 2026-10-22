// Телефон рассказывает своим компьютерам друг о друге (017): без общего бота машины иначе не
// знают соседей. Каждой машине — остальные машины телефона с их точками встречи (по ним сосед
// сам найдёт новый адрес). Запрос подписан ключом устройства этой машины (016) — принимает его
// только мост, где телефон разрешён. Знать о машине — не доступ к ней.

/** Как часто повторять, пока приложение открыто: адреса быстрых туннелей меняются. */
export const SHARE_EVERY_MS = 10 * 60_000;

/**
 * @param {{
 *   machines: () => { id: string, url: string, topic?: string, key?: string }[],
 *   send: (base: string, list: object[]) => Promise<unknown>,
 *   everyMs?: number,
 * }} deps
 */
export function createShare({ machines, send, everyMs = SHARE_EVERY_MS }) {
  let timer = null;
  // Точка встречи — только целиком: тема без ключа соседу бесполезна.
  // 019: имя — текущее (после переименования id в хранилище прежний), uid — чтобы мост не завёл дубль.
  const entry = (m) => ({ id: m.name ?? m.id, url: m.url, ...(m.topic && m.key ? { topic: m.topic, key: m.key } : {}), ...(m.uid ? { uid: m.uid } : {}) });

  async function now() {
    const all = machines().filter((m) => m.url);
    if (all.length < 2) return;
    await Promise.all(all.map((m) => send(m.url, all.filter((x) => x.id !== m.id).map(entry)).catch(() => {
      // Машина выключена или адрес переехал — расскажем в следующий раз.
    })));
  }

  return {
    now,
    start() {
      void now();
      clearInterval(timer);
      timer = setInterval(() => void now(), everyMs);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
  };
}
