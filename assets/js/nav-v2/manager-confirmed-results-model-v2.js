import { buildDealCompletionEvidence } from './deal-card-completion-evidence-model-v2.js?v=20260715-01';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_AGE_DAYS = 7;
const DEFAULT_TIME_ZONE = 'Europe/Moscow';

function text(value) {
  return String(value ?? '').trim();
}

function timestamp(value) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function maxAgeDays(options) {
  const parsed = Number(options?.maxAgeDays);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_MAX_AGE_DAYS;
}

function cardBase(item) {
  return text(item?.card_url) || `./deal-card-v2.html?id=${encodeURIComponent(item?.deal_id || '')}`;
}

function dateKey(value, timeZone = DEFAULT_TIME_ZONE) {
  const at = timestamp(value);
  if (!at) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(at));
  } catch (_) {
    return new Date(at).toISOString().slice(0, 10);
  }
}

export function managerResultCandidate(item, options = {}) {
  const now = timestamp(options.now || new Date()) || Date.now();
  const lastActivity = timestamp(item?.last_activity_at);
  const ageMs = now - lastActivity;
  return Boolean(lastActivity)
    && ageMs >= -DAY_MS
    && ageMs <= maxAgeDays(options) * DAY_MS;
}

export function buildManagerConfirmedResult(item, cardData, profile, options = {}) {
  const nowValue = options.now || new Date();
  const evidence = buildDealCompletionEvidence(cardData, profile, {
    now: nowValue,
    maxAgeDays: maxAgeDays(options)
  });
  if (!evidence.visible) return { visible: false };

  const today = dateKey(nowValue, options.timeZone || DEFAULT_TIME_ZONE);
  const completedDay = dateKey(evidence.at, options.timeZone || DEFAULT_TIME_ZONE);
  const primaryTab = text(evidence.nextAction?.primaryTab) || 'overview';

  return {
    visible: true,
    dealId: text(item?.deal_id || cardData?.deal?.id),
    dealTitle: text(item?.title || cardData?.deal?.display_title || cardData?.deal?.title) || 'Сделка',
    cardUrl: cardBase(item),
    nextHref: `${cardBase(item).split('#')[0]}#${primaryTab}`,
    window: completedDay && completedDay === today ? 'today' : 'recent',
    kind: evidence.kind,
    resultTitle: evidence.title,
    state: evidence.state,
    actor: evidence.actor,
    actorKnown: evidence.actorKnown,
    at: evidence.at,
    serverFact: evidence.serverFact,
    serverEventId: evidence.serverEventId,
    serverEventType: evidence.serverEventType,
    nextAction: evidence.nextAction
  };
}

export function sortManagerConfirmedResults(results) {
  return [...(Array.isArray(results) ? results : [])]
    .filter((item) => item?.visible)
    .sort((a, b) => timestamp(b?.at) - timestamp(a?.at));
}

export function summarizeManagerConfirmedResults(results) {
  const visible = sortManagerConfirmedResults(results);
  return {
    today: visible.filter((item) => item.window === 'today').length,
    sevenDays: visible.length
  };
}
