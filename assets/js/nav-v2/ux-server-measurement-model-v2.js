import { buildDealCompletionEvidence } from './deal-card-completion-evidence-model-v2.js?v=20260715-01';
import { buildUxMeasurementEvent, workflowDurationBucket } from './ux-measurement-model-v2.js?v=20260715-01';

const RETURN_EVENT = 'returned_to_spn_rework';
const SUBMIT_EVENT = 'spn_rework_submitted';
const RECHECK_EVENTS = new Set(['deal_review_added', 'comment_added_with_review']);

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortedEvents(data) {
  return [...list(data, 'events')]
    .filter((event) => timestamp(event?.created_at))
    .sort((a, b) => timestamp(a.created_at) - timestamp(b.created_at));
}

function firstAfter(events, eventType, afterTime) {
  return events.find((event) => event?.event_type === eventType && timestamp(event.created_at) > afterTime) || null;
}

function firstReviewAfter(events, afterTime) {
  return events.find((event) => RECHECK_EVENTS.has(event?.event_type) && timestamp(event.created_at) > afterTime) || null;
}

function serverEvent(eventName, extras = {}) {
  return buildUxMeasurementEvent({
    event_name: eventName,
    event_source: 'server',
    surface: 'deal_card',
    viewport: 'not_applicable',
    ...extras
  });
}

export function buildServerUxMeasurements(data, profile, options = {}) {
  const measurements = [];
  const completion = buildDealCompletionEvidence(data, profile || data?.profile || null, {
    now: options.now || new Date(),
    maxAgeDays: options.maxAgeDays
  });

  if (completion.visible) {
    measurements.push(serverEvent('server_result_observed', {
      result_type: completion.kind
    }));
  }

  const events = sortedEvents(data);
  const returnEvent = [...events].reverse().find((event) => event?.event_type === RETURN_EVENT) || null;
  if (!returnEvent) return measurements.filter(Boolean);

  const returnTime = timestamp(returnEvent.created_at);
  measurements.push(serverEvent('spn_rework_return_observed', {
    result_type: 'spn_rework'
  }));

  const submitEvent = firstAfter(events, SUBMIT_EVENT, returnTime);
  if (!submitEvent) return measurements.filter(Boolean);

  const submitTime = timestamp(submitEvent.created_at);
  measurements.push(serverEvent('spn_rework_submitted_observed', {
    result_type: 'spn_rework',
    duration_bucket: workflowDurationBucket(submitTime - returnTime)
  }));

  const recheckEvent = firstReviewAfter(events, submitTime);
  if (recheckEvent) {
    measurements.push(serverEvent('spn_recheck_observed', {
      result_type: 'spn_rework',
      duration_bucket: workflowDurationBucket(timestamp(recheckEvent.created_at) - submitTime)
    }));
  }

  return measurements.filter(Boolean);
}
