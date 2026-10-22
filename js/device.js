// Вход телефона без Telegram (016, R1; contracts/device-api.md). У каждой машины свой ключ
// ECDSA P-256: создаётся здесь неизвлекаемым и лежит в IndexedDB, каждый запрос к /api/v2
// подписан. Без secure context (ZeroTier по http) crypto.subtle нет — тогда мост выдаёт
// токен, и он живёт в localStorage: мост принимает его только с адреса ZeroTier.

import { b64url } from './util.js?v=238';

const ALG = { name: 'ECDSA', namedCurve: 'P-256' };

/**
 * Под каким именем лежит ключ машины. 018: машины одного владельца (общий бот) делят ключ —
 * разрешение на одной действует на всех; без владельца у каждой машины свой ключ (016).
 * @param {{ id: string, ownerId?: string }} m
 */
export const slotOf = (m) => (m.ownerId ? `owner:${m.ownerId}` : m.id);
const tokenKey = (machineId) => `ctb-token:${machineId}`;

async function sha256hex(subtle, text) {
  const d = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// crypto без значения по умолчанию в сигнатуре: иначе tsc выводит из него тип DOM Crypto, и
// node:crypto webcrypto в тестах «не подходит».
export function createDevice({ keys, storage, crypto: cr, now = () => Date.now() }) {
  const crypto = cr ?? globalThis.crypto;
  const subtle = crypto?.subtle;
  const read = (k) => { try { return storage?.getItem(k) ?? null; } catch { return null; } };

  return {
    secure: Boolean(subtle),

    /** Ключ под новый запрос доступа. Без subtle — { publicKey: null }: мост ответит токеном. */
    async prepare(machineId) {
      if (!subtle) return { publicKey: null };
      // extractable: false — относится к закрытому ключу; открытый WebCrypto отдаёт всегда.
      const pair = await subtle.generateKey(ALG, false, ['sign', 'verify']);
      const publicKey = b64url(await subtle.exportKey('spki', pair.publicKey));
      await keys.set(machineId, { deviceId: null, privateKey: pair.privateKey, publicKey });
      return { publicKey };
    },

    async approve(machineId, deviceId, token) {
      if (token) {
        try { storage?.setItem(tokenKey(machineId), `${deviceId}.${token}`); } catch { /* без хранилища — до перезагрузки */ }
        return;
      }
      const rec = await keys.get(machineId);
      // Второй опрос токен уже не отдаёт (null) — сохранённый токен не трогаем.
      if (rec) await keys.set(machineId, { ...rec, deviceId });
    },

    async has(machineId) {
      return Boolean((await keys.get(machineId))?.deviceId) || Boolean(read(tokenKey(machineId)));
    },

    async forget(machineId) {
      await keys.del(machineId);
      try { storage?.removeItem(tokenKey(machineId)); } catch { /* нечего стирать */ }
    },

    /**
     * Заголовки авторизации запроса. pathQuery — как его увидит мост: путь и ?query.
     * @returns {Promise<Record<string, string>>}
     */
    async headers(machineId, method, pathQuery, body) {
      const rec = subtle ? await keys.get(machineId) : null;
      if (rec?.deviceId && rec.privateKey) {
        const ts = String(now());
        const nonce = b64url(crypto.getRandomValues(new Uint8Array(16)));
        const m = String(method).toUpperCase();
        // Для GET хеш пустой — так в контракте; тело POST мост хеширует сырым, как пришло.
        const hash = m === 'GET' ? '' : await sha256hex(subtle, body ?? '');
        const data = new TextEncoder().encode(`${m}\n${pathQuery}\n${ts}\n${nonce}\n${hash}`);
        // WebCrypto подписывает ECDSA в IEEE-P1363 (r||s) — мост проверяет dsaEncoding: 'ieee-p1363'.
        const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, rec.privateKey, data);
        return { 'X-Device-Id': rec.deviceId, 'X-Device-Ts': ts, 'X-Device-Nonce': nonce, 'X-Device-Sig': b64url(sig) };
      }
      const tok = read(tokenKey(machineId));
      return tok ? { Authorization: `Device ${tok}` } : {};
    },
  };
}
