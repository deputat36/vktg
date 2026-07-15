const STORAGE_KEY = 'nav_v2_privacy_safe_ux_session_v1';
const MAX_EVENTS = 80;
const EVENT_BUCKET_SECONDS = 5;
const ALLOWED_SURFACES = new Set(['dashboard', 'deals', 'deal_card', 'manager']);
const ALLOWED_ACTIONS = new Set(['primary_action', 'context_action', 'refine', 'disclosure']);
const INSTALL_MARKER = 'navV2PrivacySafeUxInstalled';

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function emptyState(now = Date.now()) {
  return {
    schema_version: 1,
    started_at_ms: integer(now),
    events: []
  };
}

function storageAvailable(storage) {
  return storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function';
}

function normalizeEvent(value) {
  const surface = String(value?.surface || '');
  const action = String(value?.action || '');
  if (!ALLOWED_SURFACES.has(surface) || !ALLOWED_ACTIONS.has(action)) return null;
  return {
    surface,
    action,
    elapsed_seconds: integer(value?.elapsed_seconds)
  };
}

function readState(storage = globalThis.sessionStorage) {
  if (!storageAvailable(storage)) return emptyState();
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    const startedAt = integer(parsed?.started_at_ms, Date.now());
    const events = (Array.isArray(parsed?.events) ? parsed.events : [])
      .map(normalizeEvent)
      .filter(Boolean)
      .slice(-MAX_EVENTS);
    return { schema_version: 1, started_at_ms: startedAt, events };
  } catch (_) {
    return emptyState();
  }
}

function writeState(storage, state) {
  if (!storageAvailable(storage)) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({
      schema_version: 1,
      started_at_ms: integer(state.started_at_ms, Date.now()),
      events: (Array.isArray(state.events) ? state.events : []).slice(-MAX_EVENTS)
    }));
    return true;
  } catch (_) {
    return false;
  }
}

function median(values) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function currentSurface(root = document) {
  if (root.querySelector('.mobile-first-screen-dashboard')) return 'dashboard';
  if (root.querySelector('.mobile-first-screen-deals')) return 'deals';
  if (root.querySelector('.mobile-first-screen-deal-card')) return 'deal_card';
  if (root.querySelector('.mobile-first-screen-manager')) return 'manager';
  return '';
}

function actionForTarget(target) {
  if (!(target instanceof Element)) return '';
  if (target.closest('.mobile-first-screen-primary-action')) return 'primary_action';
  if (target.closest('[data-deals-filter], [data-filter], [data-confirmed-filter]')) return 'refine';
  if (target.closest('summary')) return 'disclosure';
  if (target.closest('[data-manager-action-kind], [data-action-focus-tab], .btn, a')) return 'context_action';
  return '';
}

export function recordPrivacySafeUxEvent(surface, action, options = {}) {
  if (!ALLOWED_SURFACES.has(surface) || !ALLOWED_ACTIONS.has(action)) return false;
  const storage = options.storage || globalThis.sessionStorage;
  const now = integer(options.now, Date.now());
  const state = readState(storage);
  const elapsed = Math.max(0, now - state.started_at_ms);
  const elapsedSeconds = Math.round((elapsed / 1000) / EVENT_BUCKET_SECONDS) * EVENT_BUCKET_SECONDS;
  state.events.push({ surface, action, elapsed_seconds: elapsedSeconds });
  state.events = state.events.slice(-MAX_EVENTS);
  return writeState(storage, state);
}

export function readPrivacySafeUxSessionSummary(storage = globalThis.sessionStorage) {
  const state = readState(storage);
  const clicksToPrimary = [];
  let clicksSincePrimary = 0;
  const surfaceCounts = { dashboard: 0, deals: 0, deal_card: 0, manager: 0 };

  state.events.forEach((event) => {
    clicksSincePrimary += 1;
    surfaceCounts[event.surface] += 1;
    if (event.action === 'primary_action') {
      clicksToPrimary.push(clicksSincePrimary);
      clicksSincePrimary = 0;
    }
  });

  const med = median(clicksToPrimary);
  return {
    schemaVersion: 1,
    eventCount: state.events.length,
    primaryActionCount: clicksToPrimary.length,
    medianClicksToPrimary: med === null ? null : Math.round(med * 10) / 10,
    latestClicksToPrimary: clicksToPrimary.length ? clicksToPrimary.at(-1) : null,
    pendingClicks: clicksSincePrimary,
    surfaceCounts,
    storageScope: 'session_only',
    transmitted: false,
    containsDealIdentifiers: false,
    containsPersonalData: false,
    containsFreeText: false
  };
}

export function installPrivacySafeUxMetrics(root = document) {
  if (!root || root[INSTALL_MARKER]) return;
  root[INSTALL_MARKER] = true;

  root.addEventListener('click', (event) => {
    const surface = currentSurface(root);
    const action = actionForTarget(event.target);
    if (surface && action) recordPrivacySafeUxEvent(surface, action);
  }, true);

  root.addEventListener('change', (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.matches('select, input[type="search"]')) return;
    const surface = currentSurface(root);
    if (surface) recordPrivacySafeUxEvent(surface, 'refine');
  }, true);
}

if (typeof document !== 'undefined') installPrivacySafeUxMetrics(document);
