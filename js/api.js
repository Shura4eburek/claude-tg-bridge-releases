// Клиент /api/v2 моста (contracts/bridge-v2-api.md). Машин может быть несколько: аппа
// грузится с общего адреса, а данные каждой лежат на её личном — запрос по сессии идёт
// туда, где сессия. Без реестра адрес пустой, и запросы относительные.

export class ApiError extends Error {
  constructor(status, body) {
    super(String(body?.message ?? body?.reason ?? body?.error ?? `мост ответил ${status}`));
    this.status = status;
    this.code = body?.code ?? '';
    this.hint = body?.hint ?? '';
  }
}

// Авторизация — провайдером (016): в Telegram это подпись X-Init-Data, вне его — ключ или
// токен устройства (device.js), у каждой машины свой. Провайдер получает путь с ?query и
// сырое тело: подпись устройства считается ровно по тому, что уйдёт на мост.
// relocate(base) — адрес не ответил: точка встречи может знать новый (rendezvous.js).
export function createApi({ fetch: f, initData = '', auth, relocate, timeoutMs = 30_000 }) {
  const authOf = auth ?? (async () => ({ 'X-Init-Data': initData }));
  async function once(base, method, path, text, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      // Пустой «?» (запрос без параметров) браузер отправляет как есть, а URL его отбрасывает —
      // подписанное и отправленное расходились, и мост отвечал «подпись не сходится» (живая
      // проверка 016). Убираем его до отправки: подписывается ровно то, что уходит.
      const sent = path.endsWith('?') ? path.slice(0, -1) : path;
      const url = `${base ?? ''}${sent}`;
      const u = new URL(url, 'http://local');
      const headers = { ...(await authOf({ base: base ?? '', method, pathQuery: u.pathname + u.search, body: text })), ...(text !== undefined ? { 'Content-Type': 'application/json' } : {}) };
      const res = await f(url, { method, headers, ...(text !== undefined ? { body: text } : {}), signal: ctl.signal });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(res.status, json);
      return json;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      // Сеть или таймаут: туннель моргнул, телефон без связи — словами, а не «Failed to fetch».
      throw new ApiError(0, { code: 'network', message: 'Мост не ответил' });
    } finally {
      clearTimeout(t);
    }
  }
  async function call(base, method, path, body, ms = timeoutMs) {
    const text = body !== undefined ? JSON.stringify(body) : undefined;
    try {
      return await once(base, method, path, text, ms);
    } catch (e) {
      if (e.status !== 0 || !relocate) throw e;
      // Быстрый туннель перезапустился — адрес новый; один повтор по нему, иначе прежняя ошибка.
      const next = await relocate(base ?? '').catch(() => null);
      if (!next || next === base) throw e;
      return once(next, method, path, text, ms);
    }
  }
  const q = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString();
  // Long-poll держит ответ до 25 с у моста; свой таймаут — с запасом на туннель.
  const LONG = 40_000;
  return {
    machines: () => call('', 'GET', '/api/machines', undefined, 5000),
    // 018: машины владельца — у самой машины, с подписью устройства (в ответе и узнанные соседи).
    machinesAt: (base) => call(base, 'GET', '/api/machines', undefined, 5000),
    sessions: (base, v) => call(base, 'GET', `/api/v2/sessions?${q({ wait: v })}`, undefined, v === undefined ? timeoutMs : LONG),
    history: (base, sessionId, after, boot, wait) => call(base, 'GET', `/api/v2/history?${q({ sessionId, after, boot, wait: wait ? 1 : undefined })}`, undefined, wait ? LONG : timeoutMs),
    before: (base, sessionId, before, limit) => call(base, 'GET', `/api/v2/history/before?${q({ sessionId, before, limit })}`),
    diff: (base, sessionId, fresh) => call(base, 'GET', `/api/v2/diff?${q({ sessionId, fresh: fresh ? 1 : undefined })}`),
    anthropicStatus: (base) => call(base, 'GET', '/api/v2/anthropic-status'),
    send: (base, body) => call(base, 'POST', '/api/v2/send', body, 120_000),
    cancelQueued: (base, sessionId, id) => call(base, 'POST', '/api/v2/queue/cancel', { sessionId, id }),
    stop: (base, sessionId) => call(base, 'POST', '/api/v2/stop', { sessionId }),
    decide: (base, sessionId, approvalId, verdict) => call(base, 'POST', '/api/v2/decision', { sessionId, approvalId, verdict }),
    answer: (base, sessionId, questionId, answer) => call(base, 'POST', '/api/v2/answer', { sessionId, questionId, answer }),
    rename: (base, sessionId, name) => call(base, 'POST', '/api/v2/name', { sessionId, name }),
    close: (base, sessionId) => call(base, 'POST', '/api/v2/session/close', { sessionId }),
    // 020: модель и effort идущей сессии; запуск отложенной роутингом.
    configure: (base, body) => call(base, 'POST', '/api/v2/configure', body),
    startNow: (base, sessionId) => call(base, 'POST', '/api/v2/session/start-now', { sessionId }, 30_000),
    // 021: решение «Авто» хоста (классификатор думает до ~5 с) и локальные модели Ollama.
    routingDecide: (base, body) => call(base, 'POST', '/api/v2/routing/decide', body, 20_000),
    local: (base) => call(base, 'GET', '/api/v2/local'),
    localAction: (base, action, model) => call(base, 'POST', '/api/v2/local/action', { action, ...(model ? { model } : {}) }, 30_000),
    projects: (base) => call(base, 'GET', '/api/v2/projects'),
    closed: (base) => call(base, 'GET', '/api/v2/sessions/closed'),
    catalog: (base) => call(base, 'GET', '/api/v2/catalog'),
    start: (base, body) => call(base, 'POST', '/api/v2/session', body, 60_000),
    resume: (base, sessionId, source, mode) => call(base, 'POST', '/api/v2/session/resume', { sessionId, source, ...(mode ? { mode } : {}) }, 60_000),
    trust: (base, body) => call(base, 'POST', '/api/v2/session/trust', body, 60_000),
    settings: (base) => call(base, 'GET', '/api/v2/settings'),
    patchSettings: (base, patch) => call(base, 'POST', '/api/v2/settings', patch),
    about: (base) => call(base, 'GET', '/api/about'),
    // Ссылка на файл (#79) — без секретов: адрес-имя для разметки. Открыть или скачать —
    // через одноразовый ключ: fileKey → fileByKey. Подпись Telegram в адрес больше не кладём:
    // адрес попадает в историю браузера, логи прокси и «Поделиться».
    fileUrl: (base, sessionId, path) => `${base ?? ''}/api/v2/file?${q({ sessionId, path })}`,
    fileKey: (base, sessionId, path) => call(base, 'POST', '/api/v2/file-key', { sessionId, path }),
    // 017: соседи этой машины — остальные машины телефона (подпись устройства).
    shareMachines: (base, machines) => call(base, 'POST', '/api/v2/machines/share', { machines }, 10_000),
    // 018: допуск, подписанный машиной владельца, — машине, которая о телефоне ещё не знает.
    ownerGrant: (base, grants) => call(base, 'POST', '/api/v2/owner/grant', { grants }, 10_000),
    fileByKey: (base, key, download) => `${base ?? ''}/api/v2/file?${q({ k: key, download: download ? 1 : undefined })}`,
  };
}

/** Адрес-имя файла из fileUrl → { base, sessionId, path }; иное — null. */
export function parseFileUrl(url) {
  const s = String(url ?? '');
  const at = s.indexOf('/api/v2/file?');
  if (at < 0) return null;
  const p = new URLSearchParams(s.slice(at + '/api/v2/file?'.length));
  const sessionId = p.get('sessionId');
  const path = p.get('path');
  return sessionId && path ? { base: s.slice(0, at), sessionId, path } : null;
}
