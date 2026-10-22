// Чистая модель мини-аппы v2: из Session и SessionEvent (@shirabe/shared) — то, что
// рисуют экраны. Одинаково для сессий хоста Shirabe и терминальных: обе мост отдаёт
// одной моделью событий (contracts/bridge-v2-api.md).

// Статусов у сессии в интерфейсе три (дизайн-система, StatusDot): работает, ждёт
// ввода, ждёт ответа. «waiting» хоста — это вопрос без ответа, то есть «ждёт ответа».
export function statusOf(session) {
  const s = session?.status;
  if (s === 'running') return { cls: 'run', word: 'работает' };
  if (s === 'approval' || s === 'waiting') return { cls: 'ask', word: 'ждёт ответа' };
  // 020: роутинг Shirabe отложил старт до сброса лимита — писать в такую сессию бесполезно.
  if (s === 'scheduled') {
    const at = session?.scheduled?.startAt;
    if (session?.scheduled?.overdue) return { cls: 'sched', word: 'ждёт сброса лимита' };
    const t = at ? new Date(at) : null;
    const hm = t && !Number.isNaN(t.getTime()) ? `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}` : '';
    return { cls: 'sched', word: hm ? `отложена до ${hm}` : 'отложена' };
  }
  return { cls: 'wait', word: 'ждёт ввода' };
}

const RANK = { ask: 0, sched: 1, run: 2, wait: 3 };

/** 020: расход сессии для шапки: «$0.42 · 120k ток.»; чего нет — того нет. */
export function costLine(cost) {
  const parts = [];
  if (typeof cost?.usd === 'number') parts.push(`$${cost.usd.toFixed(2)}`);
  if (typeof cost?.tokens === 'number') {
    const t = cost.tokens;
    parts.push(`${t >= 1e6 ? `${(t / 1e6).toFixed(1).replace(/\.0$/, '')}M` : t >= 1000 ? `${Math.round(t / 1000)}k` : t} ток.`);
  }
  return parts.join(' · ');
}

// «Ждёт ответа» — первыми: главный вопрос экрана — какая сессия ждёт меня сейчас.
export function sortSessions(list) {
  return [...(list ?? [])].sort((a, b) => RANK[statusOf(a).cls] - RANK[statusOf(b).cls] || String(a.title).localeCompare(String(b.title), 'ru'));
}

export const busy = (session) => session?.status === 'running' || session?.status === 'approval';

const BASH = new Set(['Bash', 'PowerShell']);
const TOOL_ICON = { Read: 'file', Edit: 'edit', Write: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit', Grep: 'search', Glob: 'search', WebFetch: 'globe', WebSearch: 'search', Task: 'nodes', Agent: 'nodes' };
export const toolIcon = (tool) => TOOL_ICON[tool] ?? 'terminal';

// Аргумент строки инструмента: заголовок «Bash: npm test» без имени инструмента.
export function toolArg(call) {
  const t = String(call?.title ?? '');
  const p = `${call?.tool}: `;
  return t.startsWith(p) ? t.slice(p.length) : t === call?.tool ? '' : t;
}

const WRITES = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i;

/** Файл, который агент записал или поправил, — его открывают из ленты (FR-015). */
export function producedFile(call) {
  if (!WRITES.has(call?.tool)) return null;
  const path = call.diff?.path || toolArg(call);
  if (!path) return null;
  return { path, name: path.split(/[\\/]/).pop() || path, image: IMAGE.test(path) };
}

/**
 * Лента: реплики, группы инструментов, консоль хода, субагенты, итоги карточек.
 * Ждущие подтверждение и вопрос в ленту не идут — им место в доке (pendingCard).
 */
export function feedItems(events) {
  const items = [];
  const results = new Map();
  for (const e of events ?? []) if (e.type === 'toolResult') results.set(e.callId, e);
  const subagents = new Map();
  let lastDay = '';
  const day = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toDateString();
  };
  const pushDay = (iso) => {
    const k = day(iso);
    if (k && k !== lastDay) { lastDay = k; items.push({ kind: 'day', at: iso }); }
  };
  for (const e of events ?? []) {
    if (e.type === 'message') {
      pushDay(e.at);
      items.push({ kind: e.role === 'user' ? 'me' : 'claude', event: e });
    } else if (e.type === 'toolCall') {
      const res = results.get(e.callId);
      const row = { call: e, ok: res ? res.ok : undefined, output: res?.output };
      const kind = BASH.has(e.tool) ? 'console' : 'tools';
      const prev = items[items.length - 1];
      if (prev?.kind === kind) prev.rows.push(row);
      else items.push({ kind, rows: [row] });
      // Картинка, которую агент записал, — превью в ленте сразу, а не только строкой Write.
      const file = producedFile(e);
      if (file?.image && e.tool === 'Write') items.push({ kind: 'image', file });
    } else if (e.type === 'subagent') {
      subagents.set(e.agentId, e);
      const prev = items.find((i) => i.kind === 'subagents');
      if (prev) prev.list = [...subagents.values()];
      else items.push({ kind: 'subagents', list: [...subagents.values()] });
    } else if (e.type === 'approval' && e.decision) {
      items.push({ kind: 'verdict', event: e });
    } else if (e.type === 'question' && e.answer) {
      items.push({ kind: 'answered', event: e });
    } else if (e.type === 'error') {
      items.push({ kind: 'error', event: e });
    }
  }
  return items;
}

/** Ждущее подтверждение или первый неотвеченный вопрос карточки — то, что док показывает первым. */
export function pendingCard(events) {
  const approvals = new Map();
  const questions = new Map();
  for (const e of events ?? []) {
    if (e.type === 'approval') approvals.set(e.approvalId, e);
    if (e.type === 'question') questions.set(e.questionId, e);
  }
  const approval = [...approvals.values()].reverse().find((e) => !e.decision);
  if (approval) return { kind: 'approval', event: approval };
  const open = [...questions.values()].filter((q) => !q.answer);
  if (!open.length) return null;
  // «1 из N» — по вопросам одной карточки: у них общий tool_use_id до «#».
  const key = (q) => String(q.questionId).replace(/#\d+$/, '');
  const first = open[0];
  const group = [...questions.values()].filter((q) => key(q) === key(first));
  return { kind: 'question', event: first, index: group.indexOf(first) + 1, total: group.length };
}

/** Начало хода — время последнего сообщения владельца, если сессия работает. Для таймера «Claude работает». */
export function turnStart(events) {
  for (let i = (events?.length ?? 0) - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'message' && e.role === 'user') return e.at;
  }
  return null;
}

// Слова для исхода карточки в ленте: «Разрешено в 14:42» (BotMessages, ApprovalCard).
export function verdictWord(decision) {
  if (decision === 'allow' || decision === 'always') return 'Разрешено';
  if (decision === 'deny') return 'Отклонено';
  if (decision === 'stopped') return 'Остановлено';
  if (decision === 'expired') return 'Спросил терминал';
  return '';
}

/**
 * Патч git на файлы и строки (экран «Изменения», ScreenDiff). Номер у строки — новой
 * версии файла, у удалённой — старой: так читают дифф на ревью.
 */
export function parsePatch(patch) {
  /** @typedef {{ kind: 'hunk' | 'add' | 'del' | 'ctx', ln: number | '', text: string }} PatchLine */
  /** @type {{ path: string, lines: PatchLine[] }[]} */
  const files = [];
  /** @type {{ path: string, lines: PatchLine[] } | null} */
  let cur = null;
  let oldLn = 0;
  let newLn = 0;
  for (const raw of String(patch ?? '').split('\n')) {
    if (raw.startsWith('diff --git ')) { cur = { path: '', lines: [] }; files.push(cur); continue; }
    if (!cur) continue;
    if (raw.startsWith('--- ')) { const p = raw.slice(4).replace(/^a\//, ''); if (p !== '/dev/null') cur.path = p; continue; }
    if (raw.startsWith('+++ ')) { const p = raw.slice(4).replace(/^b\//, ''); if (p !== '/dev/null') cur.path = p; continue; }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (h) { oldLn = Number(h[1]); newLn = Number(h[2]); cur.lines.push({ kind: 'hunk', ln: '', text: raw }); continue; }
    if (raw.startsWith('+')) cur.lines.push({ kind: 'add', ln: newLn++, text: raw.slice(1) });
    else if (raw.startsWith('-')) cur.lines.push({ kind: 'del', ln: oldLn++, text: raw.slice(1) });
    else if (raw.startsWith(' ')) { cur.lines.push({ kind: 'ctx', ln: newLn, text: raw.slice(1) }); oldLn++; newLn++; }
  }
  return files.filter((f) => f.path);
}

/** «Непрочитано» (FR-018): реплика позже той, что владелец видел. Не видел ни одной — не горит. */
export function unread(session, read) {
  return Boolean(session?.lastAt && read && session.lastAt > read);
}
