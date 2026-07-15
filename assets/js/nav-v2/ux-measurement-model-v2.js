export const UX_MEASUREMENT_SCHEMA_VERSION = 1;

const EVENT_NAMES = new Set([
  'primary_action_opened',
  'secondary_details_opened',
  'server_result_observed',
  'spn_rework_return_observed',
  'spn_rework_submitted_observed',
  'spn_recheck_observed'
]);

const EVENT_SOURCES = new Set(['ui', 'server']);
const SURFACES = new Set(['dashboard', 'deals', 'deal_card', 'manager']);
const VIEWPORTS = new Set(['compact', 'mobile', 'desktop', 'not_applicable']);
const ACTION_SLOTS = new Set(['primary', 'secondary', 'context']);
const ACTION_KINDS = new Set([
  'open_priority',
  'continue_work',
  'open_next_step',
  'submit_rework',
  'open_recheck',
  'document_workflow',
  'manager_card',
  'manager_tasks',
  'manager_risks',
  'manager_documents',
  'manager_responsibility',
  'expand_context',
  'other_primary'
]);
const RESULT_TYPES = new Set(['task', 'document', 'risk', 'deal_status', 'spn_rework']);
const DURATION_BUCKETS = new Set([
  'under_15s',
  '15_to_30s',
  '30_to_60s',
  '1_to_3m',
  'over_3m',
  'under_15m',
  '15_to_60m',
  '1_to_4h',
  '4_to_24h',
  '1_to_3d',
  'over_3d'
]);

function enumValue(value, allowed) {
  const normalized = String(value || '').trim();
  return allowed.has(normalized) ? normalized : '';
}

export function surfaceFromPath(pathname) {
  const path = String(pathname || '').split('?')[0].split('#')[0];
  if (path.endsWith('/dashboard-v2.html') || path === 'dashboard-v2.html') return 'dashboard';
  if (path.endsWith('/deals-v2.html') || path === 'deals-v2.html') return 'deals';
  if (path.endsWith('/deal-card-v2.html') || path === 'deal-card-v2.html') return 'deal_card';
  if (path.endsWith('/manager-v2.html') || path === 'manager-v2.html') return 'manager';
  return '';
}

export function viewportBucket(width) {
  const value = Number(width);
  if (!Number.isFinite(value) || value <= 0) return 'desktop';
  if (value <= 430) return 'compact';
  if (value <= 860) return 'mobile';
  return 'desktop';
}

export function uiLatencyBucket(milliseconds) {
  const value = Math.max(0, Number(milliseconds) || 0);
  if (value < 15_000) return 'under_15s';
  if (value < 30_000) return '15_to_30s';
  if (value < 60_000) return '30_to_60s';
  if (value < 180_000) return '1_to_3m';
  return 'over_3m';
}

export function workflowDurationBucket(milliseconds) {
  const value = Math.max(0, Number(milliseconds) || 0);
  if (value < 15 * 60_000) return 'under_15m';
  if (value < 60 * 60_000) return '15_to_60m';
  if (value < 4 * 60 * 60_000) return '1_to_4h';
  if (value < 24 * 60 * 60_000) return '4_to_24h';
  if (value < 3 * 24 * 60 * 60_000) return '1_to_3d';
  return 'over_3d';
}

export function buildUxMeasurementEvent(input = {}) {
  const eventName = enumValue(input.event_name, EVENT_NAMES);
  const eventSource = enumValue(input.event_source, EVENT_SOURCES);
  const surface = enumValue(input.surface, SURFACES);
  const viewport = enumValue(input.viewport, VIEWPORTS);
  if (!eventName || !eventSource || !surface || !viewport) return null;

  const event = {
    schema_version: UX_MEASUREMENT_SCHEMA_VERSION,
    event_name: eventName,
    event_source: eventSource,
    surface,
    viewport
  };

  const actionKind = enumValue(input.action_kind, ACTION_KINDS);
  const actionSlot = enumValue(input.action_slot, ACTION_SLOTS);
  const resultType = enumValue(input.result_type, RESULT_TYPES);
  const durationBucket = enumValue(input.duration_bucket, DURATION_BUCKETS);

  if (actionKind) event.action_kind = actionKind;
  if (actionSlot) event.action_slot = actionSlot;
  if (resultType) event.result_type = resultType;
  if (durationBucket) event.duration_bucket = durationBucket;

  return Object.freeze(event);
}
