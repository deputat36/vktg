import assert from 'node:assert/strict';
import {
  buildPrivacySafeServerMetrics,
  buildPrivacySafeUxReport,
  normalizePrivacySafeJourney,
  summarizePrivacySafeJourneys
} from '../assets/js/nav-v2/ux-metrics-model-v2.js';

const now = new Date('2026-07-15T12:00:00.000Z');
const journeys = [
  { page: 'dashboard', viewport: 'mobile', clicksToMain: 1, elapsedBucket: '0-5s', dealId: 'must-disappear' },
  { page: 'deal-card', viewport: 'desktop', clicksToMain: 3, elapsedBucket: '16-30s', address: 'must-disappear' },
  { page: 'unknown', viewport: 'desktop', clicksToMain: 1, elapsedBucket: '0-5s' }
];

assert.deepEqual(normalizePrivacySafeJourney(journeys[0]), {
  page: 'dashboard', viewport: 'mobile', clicksToMain: 1, elapsedBucket: '0-5s'
});
const local = summarizePrivacySafeJourneys(journeys);
assert.equal(local.samples, 2);
assert.equal(local.medianClicks, 2);
assert.equal(local.oneClickRatePercent, 50);
assert.equal(local.byPage.dashboard.samples, 1);
assert.equal(local.byPage['deal-card'].samples, 1);

const cardOne = {
  deal: { id: 'deal-secret-1', address: 'secret address' },
  events: [
    { event_type: 'returned_to_spn_rework', created_at: '2026-07-13T08:00:00.000Z', event_data: { comment: 'secret return text' } },
    { event_type: 'spn_rework_submitted', created_at: '2026-07-13T10:00:00.000Z', event_data: { deal_id: 'deal-secret-1' } },
    { event_type: 'deal_review_added', created_at: '2026-07-13T12:00:00.000Z', event_data: { decision: 'approved', review_id: 'review-secret' } }
  ]
};
const cardTwo = {
  deal: { id: 'deal-secret-2', title: 'secret title' },
  events: [
    { event_type: 'spn_rework_submitted', created_at: '2026-07-14T09:00:00.000Z', event_data: { deal_id: 'deal-secret-2' } }
  ]
};
const confirmedResults = [{ visible: true, dealId: 'deal-secret-1', actor: 'Secret Person' }];

const server = buildPrivacySafeServerMetrics([cardOne, cardTwo], confirmedResults, { now, windowDays: 7 });
assert.equal(server.sampledDeals, 2);
assert.equal(server.confirmedResults, 1);
assert.equal(server.confirmedResultRatePercent, 50);
assert.equal(server.spnReturns, 1);
assert.equal(server.reworkSubmissions, 2);
assert.equal(server.completedRechecks, 1);
assert.equal(server.pendingRechecks, 1);
assert.equal(server.medianRecheckMinutes, 120);
assert.equal(server.medianRecheckLabel, '2 ч');

const report = buildPrivacySafeUxReport({
  cardSamples: [cardOne, cardTwo],
  confirmedResults,
  journeyRecords: journeys,
  now,
  windowDays: 7,
  sampleLimit: 40
});
const serialized = JSON.stringify(report);
for (const forbidden of ['deal-secret-1', 'deal-secret-2', 'secret address', 'secret title', 'Secret Person', 'secret return text', 'review-secret', 'must-disappear']) {
  assert.equal(serialized.includes(forbidden), false, `report leaked ${forbidden}`);
}
assert.equal(report.privacy.contains_deal_ids, false);
assert.equal(report.privacy.contains_comments, false);
assert.equal(report.privacy.sends_network_telemetry, false);
assert.equal(report.privacy.local_storage_used, false);
assert.equal(report.interpretation.local_click_is_result, false);
assert.equal(report.interpretation.confirmed_result_requires_server_event_and_current_state_match, true);

console.log('Navigator v2 privacy-safe UX metrics semantics passed');
