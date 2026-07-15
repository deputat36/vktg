const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_AGE_DAYS = 7;
const REWORK_RETURN = 'returned_to_spn_rework';
const REWORK_SUBMIT = 'spn_rework_submitted';
const REVIEW_EVENTS = new Set(['deal_review_added', 'comment_added_with_review', REWORK_RETURN, 'status_changed']);

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function timestamp(value) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventData(event) {
  return event?.event_data && typeof event.event_data === 'object' ? event.event_data : {};
}

function maxAgeDays(options) {
  const parsed = Number(options?.maxAgeDays);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_MAX_AGE_DAYS;
}

function inWindow(event, now, ageDays) {
  const at = timestamp(event?.created_at);
  return Boolean(at) && now - at <= ageDays * DAY_MS && at - now <= DAY_MS;
}

function isReviewCompletion(event) {
  if (!REVIEW_EVENTS.has(event?.event_type)) return false;
  const payload = eventData(event);
  if (event.event_type === 'deal_review_added') return Boolean(payload.decision);
  if (event.event_type === 'comment_added_with_review') return Boolean(payload.review_decision);
  if (event.event_type === REWORK_RETURN) return true;
  if (event.event_type === 'status_changed') {
    return payload.old_status === 'need_lawyer' && payload.status && payload.status !== 'need_lawyer';
  }
  return false;
}

function median(values) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function completedRecheckDurations(events) {
  const durations = [];
  const submits = events.filter((event) => event.event_type === REWORK_SUBMIT);

  submits.forEach((submit) => {
    const submittedAt = timestamp(submit.created_at);
    if (!submittedAt) return;
    const nextSubmitAt = submits
      .map((candidate) => timestamp(candidate.created_at))
      .filter((at) => at > submittedAt)
      .sort((a, b) => a - b)[0] || Number.POSITIVE_INFINITY;
    const completion = events.find((event) => {
      const at = timestamp(event.created_at);
      return at > submittedAt && at < nextSubmitAt && isReviewCompletion(event);
    });
    if (!completion) return;
    const durationHours = (timestamp(completion.created_at) - submittedAt) / (60 * 60 * 1000);
    if (Number.isFinite(durationHours) && durationHours >= 0) durations.push(durationHours);
  });

  return durations;
}

export function buildPrivacySafeServerUxSample(cardData, options = {}) {
  const now = timestamp(options.now || new Date()) || Date.now();
  const ageDays = maxAgeDays(options);
  const events = list(cardData, 'events')
    .filter((event) => inWindow(event, now, ageDays))
    .sort((a, b) => timestamp(a.created_at) - timestamp(b.created_at));
  const reviewHours = completedRecheckDurations(events);

  return {
    checked: true,
    reworkReturns: events.filter((event) => event.event_type === REWORK_RETURN).length,
    reworkSubmissions: events.filter((event) => event.event_type === REWORK_SUBMIT).length,
    completedRechecks: reviewHours.length,
    reviewHours,
    containsDealIdentifiers: false,
    containsPersonalData: false,
    containsFreeText: false
  };
}

export function summarizePrivacySafeServerUx(samples, options = {}) {
  const source = (Array.isArray(samples) ? samples : []).filter((sample) => sample?.checked);
  const reviewHours = source.flatMap((sample) => Array.isArray(sample.reviewHours) ? sample.reviewHours : []);
  const med = median(reviewHours);

  return {
    checkedDeals: source.length,
    confirmedResults: Math.max(0, Number(options.confirmedResultsCount || 0)),
    reworkReturns: source.reduce((sum, sample) => sum + Number(sample.reworkReturns || 0), 0),
    reworkSubmissions: source.reduce((sum, sample) => sum + Number(sample.reworkSubmissions || 0), 0),
    completedRechecks: source.reduce((sum, sample) => sum + Number(sample.completedRechecks || 0), 0),
    medianReviewHours: med === null ? null : Math.round(med * 10) / 10,
    maxAgeDays: maxAgeDays(options),
    source: 'existing_server_events',
    resultRequiresServerStateMatch: true,
    containsDealIdentifiers: false,
    containsPersonalData: false,
    containsFreeText: false
  };
}
