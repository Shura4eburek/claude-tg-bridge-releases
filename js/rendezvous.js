// Точка встречи (016, R3; contracts/rendezvous-env.md). Быстрый туннель меняет адрес при
// каждом запуске моста; мост кладёт текущий в свою тему ntfy.sh, зашифровав ключом из QR.
// Адрес не ответил — берём отсюда самый свежий. Расшифровка — та же, что decryptRendezvous
// в src/rendezvous.ts: base64url(IV(12) || шифртекст || тег), AES-256-GCM.

import { fromB64url } from './util.js?v=238';

const NTFY = 'https://ntfy.sh';

async function open(subtle, key, text) {
  try {
    const raw = fromB64url(text);
    if (raw.length < 12 + 16) return null;
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
    const j = JSON.parse(new TextDecoder().decode(plain));
    return j && typeof j.url === 'string' && typeof j.ts === 'number' ? j : null;
  } catch {
    // Чужой ключ, обрезанное сообщение, кто-то пишет в тему мусор — просто не наше.
    return null;
  }
}

/** Самый свежий адрес машины из темы за 12 ч — { url, ts } или null. */
export async function findAddress({ fetch: f, topic, key, machineId, crypto, timeoutMs = 10_000 }) {
  const subtle = (crypto ?? globalThis.crypto)?.subtle;
  if (!topic || !key || !subtle) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const k = await subtle.importKey('raw', fromB64url(key), 'AES-GCM', false, ['decrypt']);
    const res = await f(`${NTFY}/${encodeURIComponent(topic)}/json?poll=1&since=12h`, { signal: ctl.signal });
    if (!res.ok) return null;
    let best = null;
    for (const ln of (await res.text()).split('\n')) {
      let ev;
      try { ev = JSON.parse(ln); } catch { continue; }
      if (ev?.event !== 'message' || typeof ev.message !== 'string') continue;
      const m = await open(subtle, k, ev.message);
      if (!m || (machineId && m.id !== machineId)) continue;
      // Адрес идёт прямо в fetch — только http(s).
      if (!/^https?:\/\//i.test(m.url)) continue;
      if (!best || m.ts > best.ts) best = { url: m.url.replace(/\/+$/, ''), ts: m.ts };
    }
    return best;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
