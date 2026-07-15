const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 7;
const DECISIVE_RECHECK_EVENTS = new Set([
  'returned_to_spn_rework',
  'deal_review_added',
  'comment_added_with_review',
  'status_changed'
]);
const SAFE_PAGES = new Set(['dashboard', 'deals', 'deal-card', 'manager']);
const SAFE_VIEWPORTS = new Set(['mobile', 'desktop']);
const SAFE_ELAPSED_BUCKETS = new Set(['0-5s', '6-15s', '16-30s', '31-60s', '60s+']);

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function timestamp(value) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventData(event) {
  return event?.event_data && typeof event.event_data === 'object' ? event.event_data : {};
}

function withinWindow(value, now, windowDays) {
  const at = timestamp(value);
  return Boolean(at) && at <= now + DAY_MS && now - at <= windowDays * DAY_MS;
}

function median(values) {
  const numbers = list(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

function percent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((Number(numerator || 0) / Number(denominator || 1)) * 1000) / 10;
}

function decisiveRecheckEvent(event) {
  if (!DECISIVE_RECHECK_EVENTS.has(event?.event_type)) return false;
  if (event.event_type !== 'status_changed') return true;
  const status = text(eventData(event).status);
  return Boolean(status) && status !== 'need_lawyer';
}

function recheckCycles(cardData, now, windowDays) {
  const events = list(cardData?.events)
    .filter((event) => timestamp(event?.created_at))
    .sort((a, b) => timestamp(a.created_at) - timestamp(b.created_at));
  const submissions = events.filter((event) => event?.event_type === 'spn_rework_submitted' && withinWindow(event.created_at, now, windowDays));
  const durations = [];
  let pending = 0;

  submissions.forEach((submitEvent, index) => {
    const submittedAt = timestamp(submitEvent.created_at);
    const nextSubmissionAt = timestamp(submissions[index + 1]?.created_at) || Number.POSITIVE_INFINITY;
    const decision = events.find((event) => {
      const at = timestamp(event.created_at);
      return at > submittedAt && at < nextSubmissionAt && decisiveRecheckEvent(event);
    });
    if (!decision) {
      pending += 1;
      return;
    }
    durations.push(Math.max(0, timestamp(decision.created_at) - submittedAt));
  });

  return { submissions: submissions.length, completed: durations.length, pending, durations };
}

function durationLabel(minutes) {
  if (!Number.isFinite(minutes)) return 'нет завершённых циклов';
  if (minutes < 60) return `${Math.round(minutes)} мин`;
  if (minutes < 24 * 60) return `${Math.round((minutes / 60) * 10) / 10} ч`;
  return `${Math.round((minutes / 1440) * 10) / 10} дн`;
}

export function normalizePrivacySafeJourney(record) {
  const page = text(record?.page);
  const viewport = text(record?.viewport);
  const elapsedBucket = text(record?.elapsedBucket);
  const clicksToMain = Math.max(1, Math.min(20, Math.trunc(Number(record?.clicksToMain) || 0)));
  if (!SAFE_PAGES.has(page) || !SAFE_VIEWPORTS.has(viewport) || !SAFE_ELAPSED_BUCKETS.has(elapsedBucket)) return null;
  return { page, viewport, clicksToMain, elapsedBucket };
}

export function summarizePrivacySafeJourneys(records) {
  const safe = list(records).map(normalizePrivacySafeJourney).filter(Boolean);
  const clicks = safe.map((item) => item.clicksToMain);
  const byPage = {};
  for (const page of SAFE_PAGES) {
    const pageRecords = safe.filter((item) => item.page === page);
    byPage[page] = {
      samples: pageRecords.length,
      medianClicks: median(pageRecords.map((item) => item.clicksToMain)),
      oneClickRatePercent: percent(pageRecords.filter((item) => item.clicksToMain === 1).length, pageRecords.length)
    };
  }
  return {
    samples: safe.length,
    medianClicks: median(clicks),
    oneClickRatePercent: percent(safe.filter((item) => item.clicksToMain === 1).length, safe.length),
    byPage
  };
}

export function buildPrivacySafeServerMetrics(cardSamples, confirmedResults, options = {}) {
  const now = timestamp(options.now || new Date()) || Date.now();
  const windowDays = Math.max(1, Number(options.windowDays || DEFAULT_WINDOW_DAYS));
  const cards = list(cardSamples).filter((card) => card && typeof card === 'object');
  const results = list(confirmedResults).filter((item) => item?.visible !== false);
  let returns = 0;
  let submissions = 0;
  let completedRechecks = 0;
  let pendingRechecks = 0;
  const recheckDurations = [];

  cards.forEach((card) => {
    returns += list(card?.events).filter((event) => event?.event_type === 'returned_to_spn_rework' && withinWindow(event.created_at, now, windowDays)).length;
    const cycles = recheckCycles(card, now, windowDays);
    submissions += cycles.submissions;
    completedRechecks += cycles.completed;
    pendingRechecks += cycles.pending;
    recheckDurations.push(...cycles.durations);
  });

  const medianMinutes = median(recheckDurations.map((value) => value / 60000));
  return {
    sampledDeals: cards.length,
    confirmedResults: results.length,
    confirmedResultRatePercent: percent(results.length, cards.length),
    spnReturns: returns,
    reworkSubmissions: submissions,
    completedRechecks,
    pendingRechecks,
    medianRecheckMinutes: Number.isFinite(medianMinutes) ? Math.round(medianMinutes) : null,
    medianRecheckLabel: durationLabel(medianMinutes),
    windowDays
  };
}

export function buildPrivacySafeUxReport({ cardSamples, confirmedResults, journeyRecords, now = new Date(), windowDays = DEFAULT_WINDOW_DAYS, sampleLimit = 40 } = {}) {
  const localJourney = summarizePrivacySafeJourneys(journeyRecords);
  const serverOutcomes = buildPrivacySafeServerMetrics(cardSamples, confirmedResults, { now, windowDays });
  return {
    schema_version: 1,
    contract: 'navigator_v2_privacy_safe_ux_metrics',
    generated_at: new Date(now).toISOString(),
    local_journey: localJourney,
    server_outcomes: serverOutcomes,
    sampling: {
      card_limit: sampleLimit,
      loaded_cards: serverOutcomes.sampledDeals,
      window_days: serverOutcomes.windowDays,
      local_scope: 'current_browser_tab_session',
      server_scope: 'visible_recent_deals_loaded_with_existing_read_rpcs'
    },
    privacy: {
      contains_deal_ids: false,
      contains_entity_ids: false,
      contains_names: false,
      contains_addresses: false,
      contains_contacts: false,
      contains_comments: false,
      contains_document_text: false,
      sends_network_telemetry: false,
      local_storage_used: false,
      session_storage_contains_only_aggregate_journeys: true
    },
    interpretation: {
      local_click_is_result: false,
      confirmed_result_requires_server_event_and_current_state_match: true,
      recheck_duration_uses_server_event_pairs: true
    }
  };
}
