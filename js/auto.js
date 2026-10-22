// 021: «Авто» в листе новой сессии — решение хоста Shirabe о паре «агент + модель» и аккаунте.
// Правила — как в окне Shirabe (shirabe/src/new-session/auto.ts): телефон не решает сам, а
// показывает решение хоста и передаёт его обратно при запуске — «Активность» окна объяснит запуск.

import { clock } from './util.js?v=238';

/** Подписи категорий — те же, что в окне (shirabe/src/bench/labels.ts). */
export const CATEGORY_LABEL = {
  fix: 'Фикс бага',
  review: 'Ревью',
  summary: 'Саммари',
  commit: 'Commit message',
  long: 'Длинный контекст',
  translate: 'Перевод UI',
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL);

const SOURCE = { rules: 'по правилам', classifier: 'по классификатору', default: 'по умолчанию', manual: 'выбрана вручную' };

/**
 * Пауза после ввода. Каждое решение гоняет классификатор хоста на Haiku — вживую 2% пятичасового
 * лимита за раз (2026-10-22): пауза — пока задачу дописывают, а не между словами. С ~3,5 с
 * классификатора решение всё ещё укладывается в 5 с (SC-002).
 */
export const AUTO_PAUSE_MS = 1500;

/** Ключ запроса: ответ по другому ключу — по устаревшему тексту или категории — не показываем. */
export const decideKey = (projectId, category, text) => `${projectId}|${category ?? ''}|${String(text ?? '').trim()}`;

const pct = (v) => `${Math.round(v)}%`;

/** «Фикс бага · по правилам · не уверен». */
export function reasonHead(d) {
  return [CATEGORY_LABEL[d.category] ?? d.category, SOURCE[d.categorySource] ?? '', d.unsure ? 'не уверен' : ''].filter(Boolean).join(' · ');
}

/** Подпись варианта для исхода «спросить» — как в окне (choiceLabel). */
export function choiceLabel(c, accounts = [], modelName = (m) => m) {
  if (c.kind === 'wait') return `Подождать сброса — старт в ${clock(c.startAt)}`;
  if (c.kind === 'fallback') {
    const name = c.pair.providerId === 'ollama' ? c.pair.model : modelName(c.pair.model);
    return `Запасная ${name}${c.successPct !== undefined ? ` · ${pct(c.successPct)}` : ''}`;
  }
  const label = accounts.find((a) => a.id === c.accountId)?.label ?? c.accountId;
  return `Запустить на «${label}» всё равно · ${pct(c.limit5h)}`;
}

/**
 * Решение с выбранным вариантом: вариант — последним шагом объяснения, чтобы «Активность»
 * показала, что решил владелец (applyDecision окна).
 */
export function applyChoice(d, choice, modelName) {
  if (!choice) return d;
  const label = choiceLabel(choice, d.accounts, modelName);
  const steps = [...(d.steps ?? []), `выбрано: ${label.charAt(0).toLowerCase()}${label.slice(1)}`];
  if (choice.kind === 'wait') return { ...d, steps, outcome: 'wait', startAt: choice.startAt, manual: true };
  if (choice.kind === 'fallback') return { ...d, steps, outcome: 'start', pair: choice.pair, successPct: choice.successPct, accountId: undefined, manual: true };
  return { ...d, steps, outcome: 'start', accountId: choice.accountId, manual: true };
}

/** Почему «Запустить» недоступна; null — можно запускать. */
export function autoBlocked(text, d, choice) {
  if (!String(text ?? '').trim()) return 'Опишите задачу — по ней «Авто» выберет пару';
  if (!d) return 'Подбираю пару…';
  if (d.outcome === 'none') return 'Мало данных для категории — выберите вручную';
  if (d.outcome === 'ask' && !choice) return 'Все аккаунты заняты — выберите, как поступить';
  return null;
}

/** «Изменить»: решение остаётся у сессии, но как ручное — с той парой, что выбрал владелец. */
export function manualDecision(d, pick) {
  const { choices: _c, startAt: _s, ...rest } = d;
  return { ...rest, manual: true, outcome: 'start', pair: { agentId: pick.agentId, providerId: pick.providerId, model: pick.model }, accountId: pick.accountId };
}

/** Пара решения есть в каталоге машины — иначе (агент выключен, модель удалена) молча не запускаем. */
export function pairKnown(pair, catalog) {
  if (!pair) return false;
  const agent = (catalog?.agents ?? []).find((a) => a.id === pair.agentId && a.owned && a.enabled !== false && a.found !== false);
  return Boolean(agent) && (catalog?.models ?? []).some((m) => m.providerId === pair.providerId && m.name === pair.model);
}
