// Экраны мини-аппы v2 — чистые функции: состояние → разметка по классам дизайн-системы
// TgBridge (design/components, префикс tb-). Иконки — <i data-i>, их разворачивает
// TgBridge.hydrate() после вставки. Поведение навешивает app.js по data-act.

import { ago, clock, esc, icon, size, timer } from './util.js?v=238';
import { dataImages, hostNotes, inboxAttachments, isImagePath, outboxAttachments } from './attach.js?v=238';
import { md } from './md.js?v=238';
import { CATEGORIES, CATEGORY_LABEL, applyChoice, autoBlocked, choiceLabel, reasonHead } from './auto.js?v=238';
import { costLine, feedItems, parsePatch, pendingCard, producedFile, sortSessions, statusOf, toolArg, toolIcon, unread, verdictWord } from './model.js?v=238';

const AGENT = {
  'claude-code': { name: 'Claude', be: 'C' },
  opencode: { name: 'OpenCode', be: 'O' },
  antigravity: { name: 'Antigravity', be: 'A' },
  codex: { name: 'Codex', be: 'X' },
  'qwen-code': { name: 'Qwen', be: 'Q' },
};
export const agentOf = (id) => AGENT[id] ?? { name: id || 'Агент', be: '•' };

// «claude-sonnet-5-5» → «Sonnet 5.5»: так модели называет окно Shirabe. Локальные
// (qwen3:14b) и незнакомые — как есть.
export function modelLabel(model) {
  const m = /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/i.exec(String(model ?? ''));
  if (!m) return String(model ?? '');
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`;
}

const dot = (cls, live = false) => `<span class="tb-st tb-st--${cls}${live ? ' is-live' : ''}" aria-hidden="true"></span>`;
const chip = (st) => `<span class="tb-chip tb-chip--${st.cls}">${dot(st.cls, st.cls === 'run')}${esc(st.word)}</span>`;

export function limitBadge(pct) {
  if (typeof pct !== 'number') return '';
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  const cls = v >= 100 ? ' tb-limit--error' : v >= 80 ? ' tb-limit--warn' : '';
  return `<span class="tb-limit${cls}" title="Лимит за 5 часов">5ч <b>${v}%</b><i style="--v:${v}%"></i></span>`;
}

export function nav(on, askCount = 0) {
  // span, а не button: так нижняя навигация размечена в дизайн-системе (.tb-nav > span).
  const item = (id, ic, label) => `<span role="button" tabindex="0" class="${on === id ? 'is-on' : ''}" data-act="nav" data-to="${id}">${icon(ic)}${label}${id === 'sessions' && askCount ? `<span class="bd">${askCount}</span>` : ''}</span>`;
  return `<nav class="tb-nav">${item('sessions', 'terminal', 'Сессии')}${item('projects', 'folder', 'Проекты')}${item('settings', 'sliders', 'Настройки')}</nav>`;
}

export function machineTabs(machines, active, counts = {}, down = [], bare = false) {
  if ((machines?.length ?? 0) < 2) return '';
  const total = Object.values(counts).reduce((n, x) => n + x, 0);
  // bare (021, экран моделей): только машины — ни «Все», ни счётчиков.
  const all = bare ? '' : `<button class="tb-mtab${active === 'all' ? ' is-active' : ''}" role="tab" aria-selected="${active === 'all'}" data-act="machine" data-id="all">Все<span class="n">${total}</span></button>`;
  const tab = (m) => {
    const tail = down.includes(m.id) ? '<span class="tb-st tb-st--err" aria-label="не отвечает"></span>' : bare ? '' : `<span class="n">${counts[m.id] ?? 0}</span>`;
    return `<button class="tb-mtab${active === m.id ? ' is-active' : ''}" role="tab" aria-selected="${active === m.id}" data-act="machine" data-id="${esc(m.id)}">${icon('monitor', 'sm')}${esc(m.name ?? m.id)}${m.role ? ` <small>${esc(m.role)}</small>` : ''}${tail}</button>`;
  };
  return `<div class="tb-mtabs" role="tablist">${all}${machines.map(tab).join('')}</div>`;
}

export function empty(ic, title, desc, action) {
  return `<div class="tb-empty">${icon(ic)}<div class="t">${esc(title)}</div>${desc ? `<div class="d">${esc(desc)}</div>` : ''}${action ? `<div class="a">${action}</div>` : ''}</div>`;
}

export function banner(text, retry = true) {
  return `<div class="tb-banner" role="status">${icon('warn', 'sm')}<span class="tb-sp">${esc(text)}</span>${retry ? '<button class="tb-btn tb-btn--sm" data-act="retry">Повторить</button>' : ''}</div>`;
}

// --- Сессии -------------------------------------------------------------------

export function sessionCard(s, ctx) {
  const st = statusOf(s);
  const project = ctx.projects?.[s.projectId]?.name ?? s.projectId ?? '';
  const acc = ctx.accounts?.[s.accountId];
  const agent = agentOf(s.agentId);
  const pv = [agent.name, modelLabel(s.model)].filter(Boolean).join(' · ');
  // На вкладке «Все» видно, с какой машины сессия (FR-019).
  const src = [s.source === 'terminal' ? 'терминал' : 'Shirabe', ctx.machineTab === 'all' ? s.machine : ''].filter(Boolean).join(' · ');
  const dotNew = unread(s, ctx.readOf?.(s.id)) ? '<span class="tb-unread" aria-label="непрочитано"></span>' : '';
  return `<div class="tb-scard${st.cls === 'ask' ? ' is-ask' : ''}" role="button" tabindex="0" data-act="open" data-id="${esc(s.id)}">`
    + `<div class="r1">${dot(st.cls, st.cls === 'run')}<span class="nm">${esc(s.title || project || s.id.slice(0, 8))}</span>${dotNew}<span class="tm">${esc(s.lastAt ? ago(s.lastAt, ctx.now) : '')}</span></div>`
    + `<div class="proj">${icon('folder', 'sm')}<span class="tb-ell">${esc(project)}</span><span class="tb-src">${esc(src)}</span></div>`
    + `<div class="pv">${esc(s.preview || pv)}</div>`
    + (s.compacting ? `<div class="tb-compact"><span class="tb-spin"></span>Сжимаю историю${s.compacting.tokens ? ` · ${esc(tokensWord(s.compacting.tokens))}` : ''}</div>` : '')
    + `<div class="r3">${s.accountId ? `<span class="tb-acct">${icon('user', 'sm')}<span class="lb">${esc(acc?.label ?? s.accountId)}</span></span>${limitBadge(acc?.limit5h)}` : ''}<span class="tb-sp"></span>${chip(st)}<button class="tb-btn tb-btn--icon tb-card-x" aria-label="Закрыть сессию" data-act="close-card" data-id="${esc(s.id)}">${icon('x', 'sm')}</button></div>`
    + '</div>';
}

export function sessionsScreen(state) {
  const all = state.sessions ?? [];
  const shown = state.machineTab && state.machineTab !== 'all' && (state.machines?.length ?? 0) > 1 ? all.filter((s) => s.machine === state.machineTab) : all;
  const counts = {};
  for (const s of all) if (s.machine) counts[s.machine] = (counts[s.machine] ?? 0) + 1;
  const ask = all.filter((s) => statusOf(s).cls === 'ask').length;
  let body;
  if (state.machinesAppOnly?.includes(state.machineTab)) body = empty('monitor', 'Эта машина открывается только в приложении на телефоне', 'У неё свой бот — подпись этого Telegram-бота она не принимает. Откройте мост приложением с экрана «Домой»');
  else if (state.loading && !all.length) body = '<div class="tb-list">' + '<div class="tb-scard tb-skel"></div>'.repeat(3) + '</div>';
  else if (!shown.length) body = empty('terminal', 'Сессий нет', 'Запустите сессию в проекте — она появится здесь', '<button class="tb-btn tb-btn--primary" data-act="nav" data-to="projects">' + icon('folder') + 'Открыть проекты</button>');
  else body = `<div class="tb-list">${sortSessions(shown).map((s) => sessionCard(s, state)).join('')}</div>`;
  // Shirabe не отвечает — на какой машине: на вкладке машины — о ней, на «Все» — с именами.
  const multi = (state.machines?.length ?? 0) > 1;
  const downIds = Object.keys(state.hostDownBy ?? {}).filter((id) => state.hostDownBy[id] && (!multi || state.machineTab === 'all' || state.machineTab === id));
  const downNames = downIds.map((id) => state.machines?.find((m) => m.id === id)?.name ?? id).filter(Boolean);
  const warn = downIds.length ? banner(multi ? `Shirabe не отвечает на ${downNames.join(', ')} — его сессии там не видны` : 'Shirabe на компьютере не отвечает — сессии Shirabe не видны. Откройте Shirabe или включите режим «всегда»', false)
    : state.netError ? banner(state.netError) : '';
  return `<div class="tb-scr"><div class="tb-head"><h1>Сессии</h1></div>${machineTabs(state.machines, state.machineTab, counts, state.machinesDown)}${outageBanner(state.status)}${state.notice ? banner(state.notice, false) : ''}${warn}${body}<div class="tb-sp"></div>${nav('sessions', ask)}</div>`;
}

// --- Чат ----------------------------------------------------------------------

function dayLabel(iso, now) {
  const d = new Date(iso);
  const n = new Date(now);
  const k = (x) => x.toDateString();
  if (k(d) === k(n)) return 'Сегодня';
  if (k(d) === k(new Date(n.getTime() - 86_400_000))) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

// Вложения владельца (FR-015): терминал — файлы в .claude-tg-inbox (превью), хост —
// заметки «[файл: …]»/«[изображение]» (файлов не хранит — чипы).
function mine(text, ctx) {
  const inbox = inboxAttachments(text);
  if (inbox) return attachBlock(inbox.files, ctx) + plain(inbox.caption);
  const notes = hostNotes(text);
  if (notes) return `<div class="tb-achips">${notes.chips.map((c) => `<span class="tb-achip">${icon(c.kind === 'image' ? 'image' : 'file', 'sm')}${esc(c.name)}</span>`).join('')}</div>` + plain(notes.caption);
  return plain(text);
}
const plain = (t) => (t ? esc(t).replace(/\n/g, '<br>') : '');

// Ответ агента (FR-014): файлы по маркеру [tg-attach:] и картинки data:image — превью и
// карточки, а не служебная строка или простыня base64.
function theirs(e, ctx) {
  const out = outboxAttachments(e.text);
  const caption = out ? out.caption : e.text;
  const inl = dataImages(caption);
  const body = md(inl ? inl.text : caption, { key: e.id, expanded: ctx.expanded });
  const pics = (inl?.images ?? []).map((im) => imageTile(im.src, im.name)).join('');
  return body + (out ? attachBlock(out.files, ctx) : '') + pics;
}

function attachBlock(paths, ctx) {
  if (!ctx.fileUrl) return '';
  return `<div class="tb-atts">${paths.map((p) => {
    const name = p.split(/[\\/]/).pop() || p;
    const url = ctx.fileUrl(p);
    if (isImagePath(p)) return imageTile(url, name);
    const ext = (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? '').toUpperCase();
    // Файл удалили с диска (FR-014, край «файл удалён»): пометка вместо ссылки в 404.
    if (ctx.missing?.has(url)) return `<div class="tb-file is-fail"><span class="ic">${icon('file')}<span>${esc(ext)}</span></span><div class="tb-sp"><div class="n">${esc(name)}</div><div class="s">файл недоступен</div></div></div>`;
    return `<div class="tb-file" data-check="${esc(url)}"><span class="ic">${icon('file')}<span>${esc(ext)}</span></span><div class="tb-sp"><div class="n">${esc(name)}</div><div class="s">${esc(p.slice(0, p.length - name.length) || 'файл')}</div></div>`
      + `<button class="tb-btn tb-btn--icon" aria-label="Открыть" data-act="link" data-url="${esc(url)}">${icon('external')}</button>`
      + `<button class="tb-btn tb-btn--icon" aria-label="Скачать" data-act="download" data-url="${esc(url)}" data-name="${esc(name)}">${icon('download')}</button></div>`;
  }).join('')}</div>`;
}

// Файл удалили с диска — вместо битой картинки подпись «файл недоступен».
const imageTile = (src, name) => `<div class="tb-img" role="button" tabindex="0" data-act="view" data-src="${esc(src)}" data-name="${esc(name)}"><div class="pic"><img src="${esc(src)}" alt="${esc(name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.closest('.tb-img').classList.add('is-fail')"></div><div class="cap">${icon('image', 'sm')}<b>${esc(name)}</b><span class="fail">файл недоступен</span></div></div>`;

// «Копировать» у реплики (FR-003): исходный текст события, а не то, что вышло из разметки.
const copyBtn = (id) => `<button class="tb-copy" aria-label="Копировать" data-act="copy-msg" data-id="${esc(id)}">${icon('copy', 'sm')}</button>`;

const outcome = (r) => (r.ok === true ? `<span class="ts ok">${icon('check')}</span>` : r.ok === false ? `<span class="ts err">${icon('x')}</span>` : '<span class="ts run"><span class="tb-spin" style="width:12px;height:12px"></span></span>');

function renderItem(item, ctx) {
  switch (item.kind) {
    case 'day': return `<span class="tb-day">${esc(dayLabel(item.at, ctx.now))}</span>`;
    case 'me': return `<div class="tb-me">${mine(item.event.text, ctx)}${item.event.origin === 'shirabe' ? '<small class="tb-from">из Shirabe</small>' : ''}<span class="tm">${copyBtn(item.event.id)}${clock(item.event.at)}</span></div>`;
    case 'claude': {
      const a = agentOf(ctx.session?.agentId);
      return `<div class="tb-claude"><div class="who"><span class="tb-be" aria-hidden="true">${esc(a.be)}</span>${esc(a.name)} <small>${clock(item.event.at)}</small>${copyBtn(item.event.id)}</div>${theirs(item.event, ctx)}</div>`;
    }
    case 'tools': return `<div class="tb-tools">${item.rows.map((r) => {
      // Записанный агентом файл — ссылкой: открыть его с телефона (FR-015).
      const file = producedFile(r.call);
      const arg = file && ctx.fileUrl ? `<a class="tb-link" href="${esc(ctx.fileUrl(file.path))}" target="_blank" rel="noopener">${esc(toolArg(r.call))}</a>` : esc(toolArg(r.call));
      return `<div class="tb-tool">${icon(toolIcon(r.call.tool))}<span class="tn">${esc(r.call.tool)}</span><span class="ta">${arg}</span>${outcome(r)}</div>`;
    }).join('')}</div>`;
    case 'image': {
      if (!ctx.fileUrl) return '';
      const src = ctx.fileUrl(item.file.path);
      return `<div class="tb-img" role="button" tabindex="0" data-act="view" data-src="${esc(src)}" data-name="${esc(item.file.name)}"><div class="pic"><img src="${esc(src)}" alt="${esc(item.file.name)}" style="width:100%;height:100%;object-fit:cover"></div><div class="cap">${icon('image', 'sm')}<b>${esc(item.file.name)}</b></div></div>`;
    }
    case 'console': {
      const running = item.rows.filter((r) => r.ok === undefined).length;
      return `<div class="tb-con" role="log" aria-label="Консоль хода"><div class="tb-con-h">${icon('terminal')}Консоль <small>· ${item.rows.length} ${plural(item.rows.length, 'команда', 'команды', 'команд')}${running ? ` · ${running} идёт` : ''}</small></div>`
        + item.rows.map((r) => `<div class="tb-con-row"><span class="p">$</span><span class="c">${esc(toolArg(r.call))}</span>${r.ok === true ? `<span class="r ok">${icon('check')}</span>` : r.ok === false ? '<span class="r err">ошибка</span>' : '<span class="r run"><span class="tb-spin" style="width:12px;height:12px"></span></span>'}</div>`).join('')
        + '</div>';
    }
    case 'subagents': {
      const live = item.list.filter((x) => x.status === 'running').length;
      return `<div class="tb-sub"><div class="tb-sub-h">${icon('nodes')}Субагенты <span class="tb-muted" style="font-weight:400">· ${live ? `${live} работают` : 'закончили'}</span></div>`
        + item.list.map((x) => `<div class="tb-sub-r">${x.status === 'running' ? dot('run', true) : '<span class="tb-st tb-st--done" aria-hidden="true"></span>'}<span class="n">${esc(x.title)}</span><span class="t${x.status === 'running' ? ' run' : ''}">${Math.round((x.progress ?? 0) * 100)}%</span></div>`).join('')
        + '</div>';
    }
    case 'verdict': return `<div class="tb-sys">${icon(item.event.decision === 'deny' ? 'x' : item.event.decision === 'stopped' ? 'stop' : 'check', 'sm')}<b>${esc(verdictWord(item.event.decision))}</b> в ${clock(item.event.at)} · <code>${esc(item.event.summary)}</code></div>`;
    case 'answered': return `<div class="tb-sys">${icon('question', 'sm')}${item.event.stopped ? 'Вопрос снят — ход остановлен' : `Ответ: <b>${esc((item.event.answer ?? []).join(', ') || '—')}</b>`}</div>`;
    case 'error': return `<div class="tb-sys tb-err">${icon('warn', 'sm')}${esc(item.event.message)}${item.event.hint ? ` — ${esc(item.event.hint)}` : ''}</div>`;
    default: return '';
  }
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export function approvalCard(e, ctx) {
  return `<div class="tb-decide" role="alertdialog" aria-label="Claude хочет выполнить"><div class="tb-decide-h">${icon('shield')}${esc(agentOf(ctx.session?.agentId).name)} хочет выполнить<small>${esc(e.tool)}</small></div>`
    + `<div class="tb-cmd">${esc(e.summary)}</div>`
    + (ctx.deciding?.error ? `<div class="why tb-err">${esc(ctx.deciding.error)} · <button class="tb-link" data-act="decide" data-id="${esc(e.approvalId)}" data-verdict="${esc(ctx.deciding.verdict)}">Повторить</button></div>` : '')
    + `<div class="tb-verdict"><button class="tb-btn${ctx.deciding?.busy ? ' is-busy' : ''}" data-act="decide" data-id="${esc(e.approvalId)}" data-verdict="deny">${icon('x')}Отклонить</button><button class="tb-btn tb-btn--primary" data-act="decide" data-id="${esc(e.approvalId)}" data-verdict="allow">${icon('check')}Разрешить</button></div></div>`;
}

export function questionCard(card, ctx) {
  const q = card.event;
  const chosen = ctx.choice ?? [];
  const opt = (label, i) => `<button class="tb-opt${chosen.includes(label) ? ' is-on' : ''}" role="${q.multi ? 'checkbox' : 'radio'}" aria-checked="${chosen.includes(label)}" data-act="choose" data-label="${esc(label)}" data-i="${i}"><span class="rd"></span><span><span class="l">${esc(label)}</span></span></button>`;
  return `<div class="tb-decide" role="alertdialog" aria-label="Claude спрашивает"><div class="tb-decide-h">${dot('ask')}${esc(agentOf(ctx.session?.agentId).name)} спрашивает${card.total > 1 ? `<small>${card.index} из ${card.total}</small>` : ''}</div>`
    + `<div class="q">${esc(q.text)}</div>`
    + `<div class="tb-opts" role="${q.multi ? 'group' : 'radiogroup'}">${(q.options ?? []).map(opt).join('')}<button class="tb-opt tb-opt--own${ctx.own ? ' is-on' : ''}" data-act="own"><span class="rd"></span><span class="l">Свой ответ…</span></button></div>`
    + (ctx.own ? '<textarea class="tb-field tb-field--box" data-role="own" rows="2" placeholder="Свой ответ"></textarea>' : '')
    + `<button class="tb-btn tb-btn--primary tb-btn--lg tb-btn--block" data-act="answer" data-qid="${esc(q.questionId)}"${chosen.length || ctx.own ? '' : ' disabled'}>Ответить</button></div>`;
}

export function queueBlock(queue) {
  if (!queue?.length) return '';
  return `<div class="tb-queue" role="list" aria-label="Очередь"><div class="tb-queue-h">${icon('queue')}Очередь <small>· ${queue.length} · возьмёт после хода</small></div>`
    + queue.map((m, i) => `<div class="tb-qi"><span class="no">${i + 1}</span><span class="tx">${m.files?.length ? icon('image') : ''}${esc(m.text || m.files?.map((f) => f.name).join(', ') || '')}</span>${m.error ? `<span class="tb-cap tb-err" style="flex:none" title="${esc(m.error)}">не дошло</span>` : ''}<button class="tb-btn tb-btn--icon" aria-label="Отменить" data-act="unqueue" data-id="${esc(m.id)}">${icon('x')}</button></div>`).join('')
    + '</div>';
}

export function workRow(ctx) {
  const stop = ctx.stop ?? {};
  if (stop.state === 'done') return `<div class="tb-work" role="status"><span class="lbl tb-muted">Ход прерван в ${clock(stop.at)}</span><span class="tb-stop-res ok">${icon('check')}остановлено</span></div>`;
  if (stop.state === 'fail') return `<div class="tb-work" role="status"><span class="lbl tb-err">${icon('warn')}${esc(stop.message || 'Не удалось остановить')}</span><button class="tb-stop" data-act="stop">${icon('refresh')}Ещё раз</button></div>`;
  if (!ctx.busy) return '';
  const tmr = ctx.turnStart ? timer(ctx.now - Date.parse(ctx.turnStart)) : '';
  const btn = stop.state === 'busy'
    ? '<button class="tb-stop is-busy" aria-busy="true" disabled><span class="tb-spin"></span>останавливаю…</button>'
    : `<button class="tb-stop" aria-label="Остановить ход" data-act="stop">${icon('stop')}Стоп</button>`;
  const hint = stop.state === 'hint' ? `<div class="tb-small tb-muted tb-stop-hint">${esc(stop.message)}</div>` : '';
  // Ход идёт, но агент стоит на подтверждении — «работает» вводило бы в заблуждение.
  const doing = ctx.session?.status === 'approval' ? 'ждёт подтверждения' : 'работает';
  return `<div class="tb-work" role="status"><span class="lbl"><span class="tb-dots"><i></i><i></i><i></i></span>${esc(agentOf(ctx.session?.agentId).name)} ${doing}${tmr ? ` <span class="tmr">${tmr}</span>` : ''}</span>${btn}</div>${hint}`;
}

export function composer(ctx) {
  const files = ctx.files ?? [];
  const total = files.reduce((n, f) => n + (f.size ?? 0), 0);
  const pack = files.length
    ? `<div class="tb-att">${files.map((f, i) => `<div class="tb-att-i${f.preview ? '' : ' tb-att-f'}">${f.preview ? `<span role="button" tabindex="0" aria-label="Открыть ${esc(f.name)}" data-act="view" data-src="${esc(f.preview)}" data-name="${esc(f.name)}" style="display:block;width:100%;height:100%"><img src="${esc(f.preview)}" alt="" style="width:100%;height:100%;object-fit:cover"></span>` : `<span class="n">${esc(f.name)}</span><span class="s">${esc(size(f.size))}</span>`}<button class="x" aria-label="Убрать ${esc(f.name)}" data-act="unattach" data-i="${i}">${icon('x')}</button></div>`).join('')}</div><div class="tb-att-note">${files.length} ${plural(files.length, 'файл', 'файла', 'файлов')} · ${size(total)}</div>`
    : '';
  const can = Boolean((ctx.draft ?? '').trim() || files.length) && !ctx.sending;
  return `${pack}<div class="tb-comp"><button class="tb-clip" aria-label="Прикрепить файлы" data-act="attach">${icon('clip')}</button>`
    + `<textarea class="tb-field" data-role="draft" rows="1" placeholder="Сообщение">${esc(ctx.draft ?? '')}</textarea>`
    + `<button class="tb-send${can ? '' : ' is-disabled'}" aria-label="Отправить" data-act="send"${can ? '' : ' disabled'}>${ctx.sending ? '<span class="tb-spin"></span>' : icon('send')}</button></div>`;
}

// «Показать раньше» вверху ленты (FR-005): пока у сессии есть события раньше показанных.
function earlierBlock(ctx) {
  if (!ctx.more) return '';
  const e = ctx.earlier ?? {};
  return `<div class="tb-earlier">${e.error ? `<span class="tb-small tb-err">${esc(e.error)}</span>` : ''}<button class="tb-btn tb-btn--sm" data-act="earlier"${e.busy ? ' disabled' : ''}>${e.busy ? '<span class="tb-spin"></span>Загружаю…' : e.error ? 'Повторить' : 'Показать раньше'}</button></div>`;
}

export function chatScreen(ctx) {
  const s = ctx.session;
  if (!s) return `<div class="tb-scr">${empty('warn', 'Сессия закрылась', 'Её больше нет в списке', '<button class="tb-btn" data-act="nav" data-to="sessions">К сессиям</button>')}</div>`;
  const st = statusOf(s);
  const project = ctx.projects?.[s.projectId]?.name ?? s.projectId ?? '';
  const acc = ctx.accounts?.[s.accountId]?.label ?? s.accountId ?? '';
  const meta = [project, s.machine, acc].filter(Boolean).join(' · ');
  const items = feedItems(ctx.events);
  const card = pendingCard(ctx.events);
  // 020: «отправляется…» и «не доставлено» — и в пустой ленте: первое сообщение тоже видно сразу.
  const mine = (ctx.pending ?? []).map((m) => `<div class="tb-me is-pending">${esc(m.text)}<span class="tb-small tb-muted pend">${icon('clock', 'sm')}отправляется…</span></div>`).join('')
    + (ctx.failed ?? []).map((f) => `<div class="tb-me is-fail">${esc(f.text)}<span class="fail">${icon('warn', 'sm')}не доставлено · <button class="tb-link" data-act="resend" data-id="${esc(f.id)}">повторить</button></span></div>`).join('');
  const feed = ctx.loadingFeed && !ctx.events?.length
    ? '<div class="tb-feed"><div class="tb-skel tb-skel--msg"></div><div class="tb-skel tb-skel--msg"></div></div>'
    : items.length || mine
      ? `<div class="tb-feed" data-role="feed">${earlierBlock(ctx)}${items.map((i) => renderItem(i, ctx)).join('')}${mine}</div>`
      : `<div class="tb-feed">${empty('terminal', 'Сообщений пока нет', 'Напишите первое — ответ появится здесь')}</div>`;
  const toLast = ctx.unseen ? `<button class="tb-tolast" aria-label="К последним" data-act="to-last">${icon('arrow-down', 'sm')}<span>${ctx.unseen}</span></button>` : '';
  const dock = toLast + (card?.kind === 'approval' ? approvalCard(card.event, ctx) : card?.kind === 'question' ? questionCard(card, ctx) : '')
    + scheduledBar(s, ctx) + queueBlock(ctx.queue) + workRow(ctx) + composer(ctx);
  return `<div class="tb-scr tb-scr--chat">${ctx.netError ? banner(ctx.netError) : ''}<div class="tb-chathead">${ctx.pwa ? `<button class="tb-btn tb-btn--icon" aria-label="Назад" data-act="back">${icon('chev-left')}</button>` : ''}<div class="tx"><div class="nm"><span>${esc(s.title || project)}</span></div><div class="mt">${chip(st)}<span class="tb-ell">${esc(meta)}</span></div>${headExtra(s, ctx.diff)}</div>${diffChip(ctx.diff)}<button class="tb-btn tb-btn--icon" aria-label="Ещё" data-act="menu">${icon('dots')}</button></div>${outageBanner(ctx.status)}${feed}<div class="tb-dock">${dock}</div></div>`;
}

// Чип «+N −M» в шапке чата (ScreenChat) — вход на экран «Изменения» (FR-013).
function diffChip(diff) {
  if (!diff?.files?.length) return '';
  const { added = 0, removed = 0 } = diff.summary ?? {};
  return `<span class="tb-diffchip" role="button" tabindex="0" aria-label="Изменения: +${added} −${removed}" data-act="diff"><span class="a">+${added}</span><span class="d">−${removed}</span></span>`;
}

/** Экран «Изменения» (ScreenDiff): сводка, признаки коммита и пуша, файлы построчно. */
export function diffScreen(ctx) {
  const d = ctx.diff ?? {};
  const { added = 0, removed = 0, files: n = 0 } = d.summary ?? {};
  const word = `${n} ${plural(n, 'файл', 'файла', 'файлов')}`;
  const nums = new Map((d.files ?? []).map((f) => [f.path, f]));
  const flags = [(d.changed || d.untracked) ? '<span class="tb-dflag">не закоммичено</span>' : '', d.ahead ? `<span class="tb-dflag">${d.ahead} не запушено</span>` : ''].join('');
  const sign = { add: '+', del: '−' };
  const file = (f) => {
    const cut = f.path.lastIndexOf('/') + 1;
    const st = nums.get(f.path);
    return `<div class="tb-dfile"><div class="tb-dfile-h"><span class="pth"><span>${esc(f.path.slice(0, cut))}</span><b>${esc(f.path.slice(cut))}</b></span>${st ? `<span class="nums"><span class="a">+${st.added}</span> <span class="d">−${st.removed}</span></span>` : ''}</div>`
      + f.lines.map((l) => `<div class="tb-dl ${l.kind === 'ctx' ? '' : l.kind}"><span class="ln">${l.ln}</span><span class="sg">${sign[l.kind] ?? ''}</span><span class="cd">${esc(l.text)}</span></div>`).join('')
      + '</div>';
  };
  const files = parsePatch(d.patch);
  return `<div class="tb-scr tb-scr--diff"><div class="tb-chathead"><div class="tx"><div class="nm"><span>Изменения</span></div><div class="mt"><span class="tb-ell">${esc(ctx.session?.title ?? '')} · +${added} −${removed} · ${word}</span></div></div><button class="tb-btn tb-btn--icon" aria-label="Закрыть" data-act="diff-close">${icon('x')}</button></div>`
    + `<div class="tb-scroll tb-col" style="gap:8px;padding-top:8px"><div class="tb-dsum"><span class="a">+${added}</span><span class="d">−${removed}</span><span>${word}${d.branch ? ' · ветка' : ''}</span>${d.branch ? `<span class="tb-ell" style="font:400 12px/17px var(--font-mono)">${esc(d.branch)}</span>` : ''}${flags}</div>`
    + (files.length ? files.map(file).join('') : empty('check', 'Изменений нет', 'всё закоммичено'))
    + '</div></div>';
}

// Модель, ветка и запас (FR-008): каждое — только если источник его знает; ≥ 80% — жёлтым.
export function usageLine(u) {
  const parts = [['ctx', u?.contextPct], ['5ч', u?.fiveHour], ['7д', u?.sevenDay]].filter(([, v]) => typeof v === 'number');
  if (!parts.length) return '';
  return `<span class="tb-usage">${parts.map(([k, v]) => `<span${v >= 80 ? ' class="is-warn"' : ''}>${k} ${Math.round(v)}%</span>`).join(' · ')}</span>`;
}

function headExtra(s, diff) {
  const model = [modelLabel(s.model), s.source === 'host' ? s.effort : ''].filter(Boolean).join(' · ');
  const branch = diff?.branch ? `<span class="tb-branch">${icon('branch', 'sm')}${esc(diff.branch)}</span>` : '';
  const usage = usageLine(s.usage);
  const cost = costLine(s.usage?.cost);
  if (!model && !branch && !usage && !cost) return '';
  // 020: у сессии Shirabe модель и effort меняются отсюда — как в композере окна.
  const m = !model ? '' : s.source === 'host'
    ? `<button class="tb-model" data-act="model" aria-label="Сменить модель или effort">${esc(model)}${icon('chev-down', 'sm')}</button>`
    : `<span>${esc(model)}</span>`;
  return `<div class="mt2">${m}${branch}${usage}${cost ? `<span class="tb-cost">${esc(cost)}</span>` : ''}</div>`;
}

/** 020: лист «Модель и effort» идущей сессии Shirabe. */
export function modelSheet(ctx) {
  const models = ctx.models ?? [];
  const cur = models.find((m) => m.name === ctx.model);
  const efforts = cur?.efforts ?? [];
  const select = (role, opts, value) => `<select class="tb-field tb-field--box" data-role="${role}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const known = models.some((m) => m.name === ctx.model) ? models : [{ name: ctx.model, label: modelLabel(ctx.model) }, ...models];
  return `<div class="tb-scrim" data-act="sheet-close"><div class="tb-sheet" role="dialog" aria-label="Модель и effort"><span class="grab"></span><h2>Модель и effort</h2>`
    + `<label class="tb-lbl">Модель${select('cfg-model', known.map((m) => [m.name, m.label ?? modelLabel(m.name)]), ctx.model)}</label>`
    + (efforts.length > 1 ? `<label class="tb-lbl">Effort${select('cfg-effort', efforts.map((e) => [e, e]), efforts.includes(ctx.effort) ? ctx.effort : efforts.includes('medium') ? 'medium' : efforts[0])}</label>` : '')
    + (ctx.error ? `<div class="help err">${icon('warn', 'sm')}${esc(ctx.error)}</div>` : '<div class="help">Применится к следующему ходу — идущий доработает на прежней.</div>')
    + `<div class="acts"><button class="tb-btn" data-act="sheet-close">Отмена</button><button class="tb-btn tb-btn--primary${ctx.busy ? ' is-busy' : ''}" data-act="model-go"${ctx.busy ? ' disabled' : ''}>${ctx.busy ? '<span class="tb-spin"></span>Меняю…' : 'Применить'}</button></div></div></div>`;
}

/** 020: отложенная роутингом сессия — когда стартует и «Запустить сейчас». */
function scheduledBar(s, ctx) {
  if (s?.status !== 'scheduled') return '';
  const st = statusOf(s);
  const btn = ctx.startingNow
    ? '<button class="tb-btn tb-btn--sm is-busy" disabled><span class="tb-spin"></span>Запускаю…</button>'
    : `<button class="tb-btn tb-btn--sm tb-btn--primary" data-act="start-now">${icon('play', 'sm')}Запустить сейчас</button>`;
  return `<div class="tb-sched" role="status">${icon('clock', 'sm')}<span class="tb-sp">${esc(st.word[0].toUpperCase() + st.word.slice(1))}${s.scheduled?.overdue ? '' : ' — Shirabe ждёт сброса лимита'}</span>${btn}</div>`;
}

// Авария у Anthropic (FR-009): ошибки API в ленте — не поломка моста.
export function outageBanner(status) {
  if (!status || status.level === 'ok') return '';
  return `<div class="tb-banner tb-banner--warn tb-outage" role="button" tabindex="0" data-act="outage">${icon('warn', 'sm')}<span class="tb-sp"><b>${esc(status.text)}</b><span class="d">Подробности — на странице статуса Anthropic</span></span></div>`;
}

export function outageSheet(status) {
  const inc = status?.incidents ?? [];
  return `<div class="tb-scrim" data-act="sheet-close"><div class="tb-sheet" role="dialog" aria-label="Сбой у Anthropic"><span class="grab"></span><h2>${esc(status?.text ?? 'Сбой у Anthropic')}</h2>`
    + (inc.length ? inc.map((i) => `<div class="tb-inc"><b>${esc(i.name)}</b><small class="tb-muted">${esc(i.status)}${i.updatedAt ? ` · ${clock(i.updatedAt)}` : ''}</small>${(i.updates ?? []).slice(0, 3).map((u) => `<p class="tb-small">${esc(u.text)}</p>`).join('')}<button class="tb-btn tb-btn--sm" data-act="link" data-url="${esc(i.url)}">${icon('external', 'sm')}Открыть инцидент</button></div>`).join('')
      : '<div class="help">Подробностей нет — откройте status.claude.com</div>')
    + '<div class="acts"><button class="tb-btn" data-act="sheet-close">Закрыть</button></div></div></div>';
}

// --- Проекты ------------------------------------------------------------------

export function projectsScreen(state) {
  // Вкладка машины — её проекты и закрытые; на счётчиках — число проектов, а не сессий.
  // Одна машина — вкладок нет, и запомненная вкладка прежней машины не должна прятать всё.
  const tab = (state.machines?.length ?? 0) > 1 ? state.machineTab ?? 'all' : 'all';
  const mine = (x) => tab === 'all' || (x.machine ?? '') === tab;
  const all = state.projectList ?? [];
  const list = all.filter(mine);
  const counts = {};
  for (const p of all) if (p.machine) counts[p.machine] = (counts[p.machine] ?? 0) + 1;
  const rows = list.length
    ? `<div class="tb-group">${list.map((p) => `<div class="tb-prow">${icon('folder')}<div class="tb-sp"><div class="nm">${esc(p.name)}</div><div class="ph tb-ell">${esc(p.source === 'terminal' ? 'терминал' : 'Shirabe')}${p.machine ? ` · ${esc(p.machine)}` : ''}</div></div><button class="tb-btn tb-btn--sm" data-act="start" data-id="${esc(p.id)}" data-source="${esc(p.source)}" data-machine="${esc(p.machine ?? '')}">${icon('play')}Запустить</button></div>`).join('')}</div>`
    : state.loadingProjects ? '<div class="tb-group"><div class="tb-prow tb-skel"></div><div class="tb-prow tb-skel"></div></div>'
      : empty('folder', 'Проектов нет', 'Папки проектов задаются на ПК: Shirabe → Настройки');
  const shut = (state.closedList ?? []).filter(mine);
  const closed = shut.length
    ? `<div class="tb-section-h">Закрытые</div><div class="tb-group">${shut.map((s) => `<div class="tb-prow">${icon('clock')}<div class="tb-sp"><div class="nm">${esc(s.title || s.id.slice(0, 8))}</div><div class="ph tb-ell">${esc(state.projects?.[s.projectId]?.name ?? s.projectId ?? '')} · ${esc(ago(s.closedAt, state.now))}</div></div><button class="tb-btn tb-btn--sm" data-act="resume" data-id="${esc(s.id)}" data-source="${esc(s.source)}" data-machine="${esc(s.machine ?? '')}">${icon('play')}Продолжить</button></div>`).join('')}</div>`
    : '';
  return `<div class="tb-scr"><div class="tb-head"><h1>Проекты</h1></div>${machineTabs(state.machines, state.machineTab, counts, state.machinesDown)}${state.notice ? banner(state.notice, false) : ''}<div class="tb-scroll">${rows}${closed}<div class="tb-section-h" style="text-align:center">Папки проектов задаются на ПК: Shirabe → Настройки</div></div><div class="tb-sp"></div>${nav('projects')}</div>`;
}

const PERMISSIONS = [['plan', 'План'], ['auto', 'Авто'], ['acceptEdits', 'Правки'], ['bypass', 'Без ограничений']];

/** Лист «Новая сессия»: агент, модель, аккаунт, права и первое сообщение — те же, что в окне Shirabe. */
// 021: пригодность локальной модели агенту — проба хоста (S4), метке Ollama `tools` он не верит.
const TOOLS_WORD = { ok: 'вызывает инструменты', slow: 'инструменты медленно', none: 'не вызывает инструменты' };

/** Локальная модель машины из состояния Ollama — по имени; нет состояния — ничего. */
const localOf = (ctx, m) => (m?.providerId === 'ollama' ? (ctx.local?.models ?? []).find((x) => x.name === m.name) : undefined);

function modelOption(ctx, m) {
  const l = localOf(ctx, m);
  const tail = l ? [l.loaded ? 'загружена' : 'не загружена', TOOLS_WORD[l.tools] ?? ''].filter(Boolean).join(' · ') : '';
  return [m.name, `${m.label ?? (m.providerId === 'ollama' ? m.name : modelLabel(m.name))}${tail ? ` — ${tail}` : ''}`];
}

/** 021: предупреждения о локальной модели — запуск всё равно доступен (US3). */
function localWarn(ctx, models) {
  const m = models.find((x) => x.name === ctx.model);
  if (m?.providerId !== 'ollama' || !ctx.local) return '';
  if (ctx.local.ollama && !ctx.local.ollama.running) {
    return `<div class="help err">${icon('warn', 'sm')}Ollama не запущен — сессия на локальной модели не начнётся <button class="tb-btn tb-btn--sm" data-act="ollama-start"${ctx.ollamaBusy ? ' disabled' : ''}>${ctx.ollamaBusy ? '<span class="tb-spin"></span>' : icon('play', 'sm')}Запустить Ollama</button></div>`;
  }
  return localOf(ctx, m)?.tools === 'none' ? `<div class="help err">${icon('warn', 'sm')}Модель не вызывает инструменты — агент не сможет править файлы</div>` : '';
}

/** 021: блок решения «Авто» — категория, пара, аккаунт, объяснение, варианты. */
function autoBlock(ctx) {
  // Решение хранится с ключом запроса ({ key, d }): ответ по устаревшему ключу сюда не попадает.
  const d = ctx.decision?.d;
  if (ctx.decideError) return `<div class="help err">${icon('warn', 'sm')}${esc(ctx.decideError)}</div>`;
  if (!d) return ctx.deciding ? `<div class="tb-auto is-busy"><span class="tb-spin"></span>Подбираю пару…</div>` : '';
  const view = applyChoice(d, d.choices?.[ctx.choice]);
  const agent = (ctx.agents ?? []).find((a) => a.id === view.pair?.agentId)?.name ?? view.pair?.agentId;
  const model = view.pair ? (view.pair.providerId === 'ollama' ? view.pair.model : modelLabel(view.pair.model)) : '';
  const account = view.accountId ? ((ctx.accountsList ?? []).find((a) => a.id === view.accountId)?.label ?? view.accountId) : '';
  // «Спросить» без выбора: пара решения — та, что запустить не вышло; показывать её как итог — неправда.
  const undecided = d.outcome === 'ask' && view === d;
  const head = view.outcome === 'wait' ? `Отложить до ${clock(view.startAt)}` : view.pair && !undecided ? [agent, model, account].filter(Boolean).join(' · ') : '';
  return `<div class="tb-auto"><div class="hd">${esc(reasonHead(d))}</div>${d.approx ? '<div class="tb-muted">≈ лимиты устарели — решение приблизительное</div>' : ''}`
    + (head && d.outcome !== 'none' ? `<b class="pair">${esc(head)}</b>` : '')
    + ((d.steps ?? []).length ? `<ul class="steps">${d.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '')
    + (d.outcome === 'ask' ? `<div class="choices" role="radiogroup">${(d.choices ?? []).map((c, i) => `<button class="tb-menu-r${ctx.choice === i ? ' is-on' : ''}" role="radio" aria-checked="${ctx.choice === i}" data-act="auto-choice" data-i="${i}">${esc(choiceLabel(c, d.accounts, modelLabel))}</button>`).join('')}</div>` : '')
    + (d.outcome !== 'none' ? `<button class="tb-btn tb-btn--sm" data-act="auto-edit">${icon('edit', 'sm')}Изменить</button>` : '')
    + '</div>';
}

export function startSheet(ctx) {
  const agents = ctx.agents ?? [];
  const models = (ctx.models ?? []).filter((m) => !ctx.agentProviders || ctx.agentProviders.includes(m.providerId));
  const select = (role, opts, value) => `<select class="tb-field tb-field--box" data-role="${role}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  // 021: «Авто» — только у Shirabe с роутингом (openStart): в терминал IDE пару не подбирают.
  const auto = Boolean(ctx.auto);
  const blocked = auto ? autoBlocked(ctx.first, ctx.decision?.d, ctx.decision?.d.choices?.[ctx.choice]) : null;
  const mode = ctx.canAuto && ctx.where === 'host'
    ? `<div class="tb-seg tb-seg--block" role="radiogroup" aria-label="Выбор пары"><span class="${auto ? '' : 'is-on'}" role="radio" tabindex="0" aria-checked="${!auto}" data-act="auto" data-v="0">Вручную</span><span class="${auto ? 'is-on' : ''}" role="radio" tabindex="0" aria-checked="${auto}" data-act="auto" data-v="1">${icon('route', 'sm')}Авто</span></div>`
    : '';
  const first = `<textarea class="tb-field tb-field--box" data-role="first" rows="3" placeholder="${auto ? 'Опишите задачу — по ней «Авто» выберет пару' : 'Первое сообщение (можно пусто)'}">${esc(ctx.first ?? '')}</textarea>`;
  if (auto) {
    return `<div class="tb-scrim" data-act="sheet-close"><div class="tb-sheet" role="dialog" aria-label="Новая сессия"><span class="grab"></span><h2>Новая сессия · ${esc(ctx.projectName ?? '')}</h2>`
      + (ctx.canHost ? `<label class="tb-lbl">Где${select('where', [['host', 'Shirabe'], ['terminal', 'Терминал IDE']], ctx.where)}</label>` : '')
      + mode + first
      + `<label class="tb-lbl">Категория${select('category', [['', 'Определит сам'], ...CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]])], ctx.category ?? '')}</label>`
      + autoBlock(ctx)
      + `<label class="tb-lbl">Права${select('permission', PERMISSIONS, ctx.permission ?? 'auto')}</label>`
      + (ctx.error ? `<div class="help err">${icon('warn', 'sm')}${esc(ctx.error)}</div>` : blocked && ctx.decision ? `<div class="help">${esc(blocked)}</div>` : '')
      + `<div class="acts"><button class="tb-btn" data-act="sheet-close">Отмена</button><button class="tb-btn tb-btn--primary${ctx.busy ? ' is-busy' : ''}" data-act="start-go"${ctx.busy || blocked ? ' disabled' : ''}>${ctx.busy ? '<span class="tb-spin"></span>Запускаю…' : icon('play') + 'Начать'}</button></div></div></div>`;
  }
  return `<div class="tb-scrim" data-act="sheet-close"><div class="tb-sheet" role="dialog" aria-label="Новая сессия"><span class="grab"></span><h2>Новая сессия · ${esc(ctx.projectName ?? '')}</h2>`
    + (ctx.canHost ? `<label class="tb-lbl">Где${select('where', [['host', 'Shirabe'], ['terminal', 'Терминал IDE']], ctx.where)}</label>` : '')
    + mode
    + (ctx.autoNote ? `<div class="help">${esc(ctx.autoNote)}</div>` : '')
    + (agents.length ? `<label class="tb-lbl">Агент${select('agent', agents.map((a) => [a.id, a.name]), ctx.agentId)}</label>` : '')
    + (models.length ? `<label class="tb-lbl">Модель${select('model', models.map((m) => modelOption(ctx, m)), ctx.model)}</label>` : `<label class="tb-lbl">Модель<input class="tb-field tb-field--box" data-role="model" placeholder="по умолчанию" value="${esc(ctx.model ?? '')}"></label>`)
    + localWarn(ctx, models)
    + (() => {
      // 020: effort выбранной модели; один — поля нет, уходит он.
      const efforts = models.find((m) => m.name === ctx.model)?.efforts ?? [];
      return efforts.length > 1 ? `<label class="tb-lbl">Effort${select('effort', efforts.map((e) => [e, e]), efforts.includes(ctx.effort) ? ctx.effort : efforts.includes('medium') ? 'medium' : efforts[0])}</label>` : '';
    })()
    + ((ctx.accountsList ?? []).length ? `<label class="tb-lbl">Аккаунт${select('account', ctx.accountsList.map((a) => [a.id, a.label ?? a.id]), ctx.accountId)}</label>` : '')
    + `<label class="tb-lbl">Права${select('permission', PERMISSIONS, ctx.permission ?? 'auto')}</label>`
    + first
    + (ctx.error ? `<div class="help err">${icon('warn', 'sm')}${esc(ctx.error)}</div>` : '')
    + `<div class="acts"><button class="tb-btn" data-act="sheet-close">Отмена</button><button class="tb-btn tb-btn--primary${ctx.busy ? ' is-busy' : ''}" data-act="start-go"${ctx.busy ? ' disabled' : ''}>${ctx.busy ? '<span class="tb-spin"></span>Запускаю…' : icon('play') + 'Начать'}</button></div></div></div>`;
}

/** Просмотрщик картинки на весь экран — на чистом чёрном во всех темах (ScreenFiles). */
export function viewer(v) {
  return `<div class="tb-viewer" role="dialog" aria-label="Просмотр"><div class="tb-viewer-t"><button class="vb" aria-label="Закрыть" data-act="viewer-close">${icon('x')}</button><span class="tx"><b>${esc(v.name)}</b></span>${v.src.startsWith('data:') ? `<a class="vb" aria-label="Скачать" href="${esc(v.src)}" download="${esc(v.name)}">${icon('download')}</a>` : `<button class="vb" aria-label="Скачать" data-act="download" data-url="${esc(v.src)}" data-name="${esc(v.name)}">${icon('download')}</button>`}</div><div class="tb-viewer-pic"><img src="${esc(v.src)}" alt="${esc(v.name)}" style="max-width:100%;max-height:100%"></div></div>`;
}

export function renameSheet(ctx) {
  return `<div class="tb-scrim" data-act="sheet-close"><div class="tb-sheet" role="dialog" aria-label="Переименовать сессию"><span class="grab"></span><h2>Переименовать сессию</h2>`
    + `<input class="tb-field tb-field--box" data-role="name" value="${esc(ctx.name ?? '')}" maxlength="80">`
    + (ctx.error ? `<div class="help err">${icon('warn', 'sm')}${esc(ctx.error)}</div>` : '<div class="help">Имя видно в списке, шапке чата и сообщениях бота. Пусто — имя проекта.</div>')
    + `<div class="acts"><button class="tb-btn" data-act="sheet-close">Отмена</button><button class="tb-btn tb-btn--primary" data-act="rename-go">Сохранить</button></div></div></div>`;
}

export function closeSheet(sh) {
  return `<div class="tb-scrim" data-act="sheet-close"><div class="tb-sheet" role="alertdialog" aria-label="Закрыть сессию"><span class="grab"></span><h2>${esc(sh.message)}</h2>`
    + `<div class="acts"><button class="tb-btn" data-act="sheet-close">Отмена</button><button class="tb-btn tb-btn--danger" data-act="close-go" data-id="${esc(sh.id)}">${icon('x')}Закрыть</button></div></div></div>`;
}

// 182000 → «182 тыс. токенов»: так в CLI и подсказывают размер перед «продолжить».
export const tokensWord = (n) => (n >= 1000 ? `${Math.round(n / 1000)} тыс. токенов` : `${n} токенов`);

export function resumeSheet(sh) {
  return `<div class="tb-scrim" data-act="sheet-close"><div class="tb-sheet" role="dialog" aria-label="Продолжить сессию"><span class="grab"></span><h2>Продолжить «${esc(sh.title || sh.id.slice(0, 8))}»</h2>`
    + `<div class="help">${sh.tokens ? `История — ${esc(tokensWord(sh.tokens))}. ` : ''}Целиком — дороже по лимитам; из сводки — сначала сожмёт историю.</div>`
    + `<button class="tb-menu-r" data-act="resume-go" data-mode="summary">${icon('layers')}Из сводки</button>`
    + `<button class="tb-menu-r" data-act="resume-go" data-mode="full">${icon('play')}Целиком</button>`
    + '<div class="acts"><button class="tb-btn" data-act="sheet-close">Отмена</button></div></div></div>';
}

export function trustSheet(sh) {
  return `<div class="tb-scrim" data-act="sheet-close"><div class="tb-sheet" role="alertdialog" aria-label="Доверие к папке"><span class="grab"></span><h2>Доверять папке «${esc(sh.projectName || 'проекта')}»?</h2>`
    + '<div class="help">Claude Code спрашивает это при первом запуске в папке: без доверия сессия не начнётся.</div>'
    + (sh.error ? `<div class="help err">${icon('warn', 'sm')}${esc(sh.error)}</div>` : '')
    + `<div class="acts"><button class="tb-btn" data-act="trust-go" data-yes="0"${sh.busy ? ' disabled' : ''}>Нет</button><button class="tb-btn tb-btn--primary" data-act="trust-go" data-yes="1"${sh.busy ? ' disabled' : ''}>${icon('check')}Доверять</button></div></div></div>`;
}

export function stopSheet() {
  return `<div class="tb-scrim" data-act="sheet-close"><div class="tb-sheet" role="alertdialog" aria-label="Остановить ход?"><span class="grab"></span><h2>Остановить ход?</h2>`
    + '<div class="help">Агент прервётся на месте; начатое останется как есть.</div>'
    + `<div class="acts"><button class="tb-btn" data-act="sheet-close">Отмена</button><button class="tb-btn tb-btn--danger" data-act="stop-go">${icon('stop')}Остановить</button></div></div></div>`;
}

export function menuSheet(ctx) {
  const row = (act, ic, label, danger = false) => `<button class="tb-menu-r${danger ? ' tb-err' : ''}" data-act="${act}">${icon(ic)}${label}</button>`;
  return `<div class="tb-scrim" data-act="sheet-close"><div class="tb-sheet" role="dialog" aria-label="Сессия"><span class="grab"></span>`
    + row('rename', 'edit', 'Переименовать')
    + (ctx.session?.source === 'terminal' ? row('legacy', 'terminal', 'Расширенный режим (вкладки IDE, /status)') : '')
    + row('close-session', 'x', 'Закрыть сессию', true)
    + '</div></div>';
}

// --- 021: локальные модели (Ollama) ---------------------------------------------

const gb = (v) => `${(Math.round(Number(v) * 10) / 10).toLocaleString('ru-RU')} ГБ`;
const speed = (bps) => (bps >= 1e6 ? `${(bps / 1e6).toFixed(1).replace('.', ',')} МБ/с` : `${Math.round(bps / 1e3)} КБ/с`);

/** Машины, у которых хост умеет локальные модели; одна — вкладок нет. */
export const localMachines = (state) => ((state.machines ?? []).length ? state.machines : [{ id: '' }]).filter((m) => state.featuresBy?.[m.id]?.local);

function modelRow(m, busy, running) {
  const sub = [
    gb(m.sizeGb),
    m.loaded ? `загружена${m.vramGb ? ` ${gb(m.vramGb)}` : ''}${m.ramGb ? ` + ${gb(m.ramGb)} в памяти` : ''}` : 'не загружена',
    TOOLS_WORD[m.tools] ?? '',
    m.tokPerSec ? `${Math.round(m.tokPerSec)} ток/с` : '',
  ].filter(Boolean).join(' · ');
  const b = busy === m.name;
  const btn = (a, ic, label, cls = '') => `<button class="tb-btn tb-btn--sm${cls}" data-act="local-act" data-a="${a}" data-m="${esc(m.name)}"${label ? '' : ` aria-label="Удалить ${esc(m.name)}"`}${busy ? ' disabled' : ''}>${b && a !== 'delete' ? '<span class="tb-spin"></span>' : icon(ic, 'sm')}${label}</button>`;
  // Ollama остановлен — загружать некуда: кнопка загрузки появится, когда он запустится.
  const mem = m.loaded ? btn('unload', 'eject', 'Выгрузить') : running ? btn('load', 'play', 'Загрузить') : '';
  return `<div class="tb-prow tb-lm tb-lm--model">${icon('cpu')}<div class="tb-sp"><div class="nm">${esc(m.name)}</div><div class="ph">${esc(sub)}</div></div>`
    + `<div class="acts">${mem}${btn('delete', 'x', '', ' tb-btn--danger')}</div></div>`;
}

function pullRow(p, busy) {
  const live = p.state === 'running';
  const tail = live ? `${Math.round(p.pct)}%${p.bytesPerSec ? ` · ${speed(p.bytesPerSec)}` : ''}` : p.state === 'error' ? `не скачалась: ${p.error ?? 'ошибка'}` : p.state === 'done' ? 'скачана' : 'отменена';
  return `<div class="tb-prow tb-lm">${icon('download')}<div class="tb-sp"><div class="nm">${esc(p.model)}</div><div class="ph${p.state === 'error' ? ' tb-err' : ''}">${esc(tail)}</div>${live ? `<div class="tb-bar" role="progressbar" aria-valuenow="${Math.round(p.pct)}" aria-valuemin="0" aria-valuemax="100"><i style="--v:${Math.max(0, Math.min(100, p.pct))}%"></i></div>` : ''}</div>`
    + (live ? `<div class="acts"><button class="tb-btn tb-btn--sm" data-act="local-act" data-a="cancel" data-m="${esc(p.model)}"${busy ? ' disabled' : ''}>Отменить</button></div>` : '') + '</div>';
}

export function localScreen(state) {
  const ms = localMachines(state);
  const tab = state.localTab ?? ms[0]?.id ?? '';
  const L = state.localBy?.[tab] ?? {};
  const s = L.state;
  // Компьютер перестал отвечать, а снимок остался: показываем его как устаревший, действия — нет.
  const stale = Boolean(L.error && s);
  const busy = L.busy || (stale ? 'down' : '');
  let body;
  if (L.error && !s) body = empty('warn', L.down ? 'Shirabe не запущен' : 'Не удалось прочитать', L.down ? 'Откройте Shirabe на этом компьютере' : L.error);
  else if (!s) body = '<div class="tb-group"><div class="tb-prow tb-skel"></div><div class="tb-prow tb-skel"></div></div>';
  else if (!s.ollama?.installed) body = empty('cpu', 'Ollama не установлен', 'Поставьте Ollama на компьютере — модели появятся здесь');
  else {
    const o = s.ollama;
    const head = o.running
      ? `<div class="tb-set-r"><div class="tx"><b>Ollama${o.version ? ` ${esc(o.version)}` : ''}</b><small>работает</small></div><button class="tb-btn tb-btn--sm" data-act="local-act" data-a="restart"${busy ? ' disabled' : ''}>${busy === 'restart' ? '<span class="tb-spin"></span>' : icon('refresh', 'sm')}Перезапустить</button></div>`
      : `<div class="tb-set-r"><div class="tx"><b>Ollama не запущен</b><small>Локальные модели недоступны, пока он не запущен</small></div><button class="tb-btn tb-btn--sm tb-btn--primary" data-act="local-act" data-a="start"${busy ? ' disabled' : ''}>${busy === 'start' ? '<span class="tb-spin"></span>' : icon('play', 'sm')}Запустить</button></div>`;
    const g = s.gpu;
    const hw = `<div class="tb-set-r"><div class="tx"><b>${g ? esc(g.name) : 'Видеокарта'}</b><small>${g ? `видеопамять ${esc(gb(g.vramUsedGb))} из ${esc(gb(g.vramTotalGb))} · загрузка ${Math.round(g.utilPct)}%` : 'нет данных'}</small></div></div>`
      + `<div class="tb-set-r"><div class="tx"><b>Память</b><small>${esc(gb(s.ram?.usedGb ?? 0))} из ${esc(gb(s.ram?.totalGb ?? 0))}${s.diskFreeGb !== undefined ? ` · на диске свободно ${esc(gb(s.diskFreeGb))}` : ''}</small></div></div>`;
    const pulls = (s.pulls ?? []).length ? `<div class="tb-section-h">Скачивание</div><div class="tb-group">${s.pulls.map((p) => pullRow(p, busy)).join('')}</div>` : '';
    const models = (s.models ?? []).length
      ? `<div class="tb-section-h">Модели</div><div class="tb-group">${s.models.map((m) => modelRow(m, busy, o.running)).join('')}</div>`
      : `<div class="tb-section-h">Модели</div>${empty('cpu', 'Моделей нет', 'Скачайте модель ниже')}`;
    const sugg = (s.suggestions ?? []).filter((x) => !(s.models ?? []).some((m) => m.name === x.name));
    const pull = o.running
      ? `<div class="tb-section-h">Скачать модель</div><div class="tb-set"><div class="tb-set-r is-col"><input class="tb-field tb-field--box" data-role="pull-name" placeholder="имя:тег, например qwen3:14b" value="${esc(state.pullName ?? '')}" autocapitalize="off" autocorrect="off" spellcheck="false">`
        + `<button class="tb-btn tb-btn--primary" data-act="local-pull"${busy ? ' disabled' : ''}>${icon('download', 'sm')}Скачать</button>`
        + (sugg.length ? `<div class="tb-chips">${sugg.map((x) => `<button class="tb-chip" data-act="local-act" data-a="pull" data-m="${esc(x.name)}"${busy ? ' disabled' : ''}>${esc(x.name)} · ${esc(gb(x.sizeGb))}</button>`).join('')}</div>` : '')
        + '</div></div>'
      : '';
    body = `<div class="tb-set">${head}${hw}</div>${pulls}${models}${pull}`;
  }
  const err = stale ? banner(L.down ? 'Shirabe не отвечает — показано последнее известное' : `Не обновилось: ${L.error}`, false) : L.actError ? banner(L.actError, false) : '';
  return `<div class="tb-scr"><div class="tb-head"><h1>Локальные модели</h1></div>${ms.length > 1 ? machineTabs(ms, tab, {}, state.machinesDown ?? [], true) : ''}${err}<div class="tb-scroll" style="display:flex;flex-direction:column">${body}</div><div class="tb-sp"></div>${nav('settings')}</div>`;
}

export function localDeleteSheet(sh) {
  return `<div class="tb-scrim" data-act="sheet-close"><div class="tb-sheet" role="alertdialog" aria-label="Удалить модель"><span class="grab"></span><h2>Удалить ${esc(sh.model)}?</h2>`
    + `<div class="help">${sh.sessions?.length ? `На ней идут сессии: ${esc(sh.sessions.join(', '))}. Они остановятся с ошибкой. ` : ''}Модель придётся скачать заново.</div>`
    + `<div class="acts"><button class="tb-btn" data-act="sheet-close">Отмена</button><button class="tb-btn tb-btn--danger" data-act="local-delete-go">${icon('x')}Удалить</button></div></div></div>`;
}

// --- Настройки ----------------------------------------------------------------

const TOGGLES = [
  ['Подтверждения', [['confirmTools', 'Спрашивать про каждый инструмент', 'Даже чтение файлов придёт на подтверждение']]],
  ['Пуши в личку', [
    ['notifyWaiting', '«Ждёт ответа»', 'Вопрос или подтверждение команды'],
    ['notifyFinished', '«Claude закончил»', 'Ход завершён, сессия ждёт ввода'],
    ['notifyLongRun', '«Всё ещё работает»', 'Если ход идёт дольше 10 минут'],
    ['notifyOutage', 'Сбой у Anthropic', 'Ошибки в сессии — не поломка моста'],
  ]],
];

// Установка на главный экран (016, US1 сц. 8): Android — кнопкой, iOS — словами про «Поделиться».
function installRow(kind) {
  if (kind === 'prompt') return `<div class="tb-section-h">Приложение</div><div class="tb-set"><div class="tb-set-r"><div class="tx"><b>Установить на главный экран</b><small>Открывать мост с иконки, как обычное приложение</small></div><button class="tb-btn tb-btn--sm tb-btn--primary" data-act="install">${icon('download', 'sm')}Установить</button></div></div>`;
  if (kind === 'ios') return `<div class="tb-section-h">Приложение</div><div class="tb-set"><div class="tb-set-r"><div class="tx"><b>Установить на главный экран</b><small>В Safari: «Поделиться» → «На экран „Домой“». У приложения своё хранилище: скопируйте ссылку, откройте приложение и вставьте её — компьютер спросит разрешение ещё раз</small></div><button class="tb-btn tb-btn--sm" data-act="pwa-copy-link">${icon('copy', 'sm')}Скопировать ссылку для приложения</button></div></div>`;
  return '';
}

export function settingsScreen(state) {
  const v = state.settings ?? {};
  const pend = state.settingsBusy ?? {};
  const theme = state.theme === 'console' ? 'console' : 'tg';
  // span, как в SettingRow/SegmentedControl дизайн-системы (.tb-seg > span).
  const seg = `<div class="tb-seg tb-seg--block" role="radiogroup"><span class="${theme === 'tg' ? 'is-on' : ''}" role="radio" tabindex="0" aria-checked="${theme === 'tg'}" data-act="theme" data-v="tg">Как в Telegram</span><span class="${theme === 'console' ? 'is-on' : ''}" role="radio" tabindex="0" aria-checked="${theme === 'console'}" data-act="theme" data-v="console">Консоль</span></div>`;
  const toggle = ([key, title, desc]) => `<div class="tb-set-r"><div class="tx"><b>${esc(title)}</b><small${state.settingsError === key ? ' class="tb-err"' : ''}>${esc(state.settingsError === key ? 'Не сохранилось — мост не ответил' : desc)}</small></div><button class="tb-tg${v[key] ? ' is-on' : ''}${pend[key] ? ' is-busy' : ''}" role="switch" aria-checked="${Boolean(v[key])}" data-act="toggle" data-key="${key}"></button></div>`;
  return `<div class="tb-scr"><div class="tb-head"><h1>Настройки</h1></div>${state.settingsNote ? banner(state.settingsNote, false) : ''}<div class="tb-scroll" style="display:flex;flex-direction:column">`
    + `<div class="tb-section-h">Тема</div><div class="tb-set"><div class="tb-set-r is-col">${seg}<small class="tb-small tb-muted">«Как в Telegram» — светлая или тёмная вслед за Telegram. «Консоль» — тёмная тема Shirabe.</small></div></div>`
    + TOGGLES.map(([h, rows]) => `<div class="tb-section-h">${esc(h)}</div><div class="tb-set">${rows.map(toggle).join('')}</div>`).join('')
    + (localMachines(state).length ? `<div class="tb-section-h">Компьютеры</div><div class="tb-set"><div class="tb-set-r"><div class="tx"><b>Локальные модели</b><small>Ollama: модели, загрузка в память, скачивание</small></div><button class="tb-btn tb-btn--sm" data-act="local-open">${icon('cpu', 'sm')}Открыть</button></div></div>` : '')
    + installRow(state.install)
    // Прежняя мини-аппа входит только подписью Telegram — вне его ей нечем войти.
    + (state.pwa ? '' : `<div class="tb-section-h">Расширенный режим</div><div class="tb-set"><div class="tb-set-r"><div class="tx"><b>Прежняя мини-аппа</b><small>Вкладки IDE, админ-режим, панели /status — для терминальных сессий</small></div><button class="tb-btn tb-btn--sm" data-act="legacy">Открыть</button></div></div>`)
    + `<div class="tb-set-foot">${esc(state.about ?? '')}</div></div><div class="tb-sp"></div>${nav('settings')}</div>`;
}
