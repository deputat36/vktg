import assert from 'node:assert/strict';
import {
  buildUxMeasurementEvent,
  surfaceFromPath,
  uiLatencyBucket,
  viewportBucket,
  workflowDurationBucket
} from '../assets/js/nav-v2/ux-measurement-model-v2.js?v=20260715-01';
import { buildServerUxMeasurements } from '../assets/js/nav-v2/ux-server-measurement-model-v2.js?v=20260715-01';

assert.equal(surfaceFromPath('/dashboard-v2.html'), 'dashboard');
assert.equal(surfaceFromPath('/deals-v2.html?filter=overdue'), 'deals');
assert.equal(surfaceFromPath('/deal-card-v2.html#tasks'), 'deal_card');
assert.equal(surfaceFromPath('/manager-v2.html'), 'manager');
assert.equal(surfaceFromPath('/nav-v2.html'), '');

assert.equal(viewportBucket(360), 'compact');
assert.equal(viewportBucket(430), 'compact');
assert.equal(viewportBucket(431), 'mobile');
assert.equal(viewportBucket(861), 'desktop');
assert.equal(uiLatencyBucket(14_999), 'under_15s');
assert.equal(uiLatencyBucket(45_000), '30_to_60s');
assert.equal(uiLatencyBucket(180_000), 'over_3m');
assert.equal(workflowDurationBucket(30 * 60_000), '15_to_60m');
assert.equal(workflowDurationBucket(2 * 60 * 60_000), '1_to_4h');
assert.equal(workflowDurationBucket(5 * 24 * 60 * 60_000), 'over_3d');

const safeUiEvent = buildUxMeasurementEvent({
  event_name: 'primary_action_opened',
  event_source: 'ui',
  surface: 'deals',
  viewport: 'compact',
  action_kind: 'continue_work',
  action_slot: 'primary',
  duration_bucket: '15_to_30s',
  deal_id: '366330f5-966c-4f97-8147-7e79e2ea408d',
  email: 'client@example.com',
  comment: 'Свободный текст не должен попасть в событие'
});

assert.deepEqual(Object.keys(safeUiEvent), [
  'schema_version',
  'event_name',
  'event_source',
  'surface',
  'viewport',
  'action_kind',
  'action_slot',
  'duration_bucket'
]);
assert.equal(JSON.stringify(safeUiEvent).includes('366330f5'), false);
assert.equal(JSON.stringify(safeUiEvent).includes('client@example.com'), false);
assert.equal(JSON.stringify(safeUiEvent).includes('Свободный текст'), false);
assert.equal(buildUxMeasurementEvent({ event_name: 'page_view', event_source: 'ui', surface: 'deals', viewport: 'desktop' }), null);
assert.equal(buildUxMeasurementEvent({ event_name: 'server_result_observed', event_source: 'ui', surface: 'unknown', viewport: 'desktop' }), null);

const data = {
  profile: { id: 'profile-secret-id', role: 'manager', full_name: 'Секретный сотрудник' },
  deal: {
    id: 'deal-secret-id',
    status: 'need_lawyer',
    next_action: 'Секретный следующий шаг',
    manager_id: 'profile-secret-id'
  },
  tasks: [
    { id: 'task-secret-id', title: 'Секретная задача', status: 'done', assigned_role: 'spn' }
  ],
  documents: [],
  risks: [],
  reviews: [],
  events: [
    { id: 'return-secret-id', event_type: 'returned_to_spn_rework', created_at: '2026-07-15T08:00:00Z' },
    { id: 'submit-secret-id', event_type: 'spn_rework_submitted', created_at: '2026-07-15T08:30:00Z' },
    { id: 'review-secret-id', event_type: 'deal_review_added', created_at: '2026-07-15T09:15:00Z' },
    {
      id: 'task-event-secret-id',
      actor_id: 'profile-secret-id',
      event_type: 'task_status_changed',
      created_at: '2026-07-15T09:20:00Z',
      event_data: { task_id: 'task-secret-id', status: 'done' }
    }
  ]
};

const serverEvents = buildServerUxMeasurements(data, data.profile, { now: '2026-07-15T10:00:00Z' });
assert.deepEqual(serverEvents.map((event) => event.event_name), [
  'server_result_observed',
  'spn_rework_return_observed',
  'spn_rework_submitted_observed',
  'spn_recheck_observed'
]);
assert.equal(serverEvents[0].result_type, 'task');
assert.equal(serverEvents[2].duration_bucket, '15_to_60m');
assert.equal(serverEvents[3].duration_bucket, '15_to_60m');

const serializedServerEvents = JSON.stringify(serverEvents);
for (const forbidden of [
  'deal-secret-id',
  'task-secret-id',
  'profile-secret-id',
  'Секретная задача',
  'Секретный сотрудник',
  '2026-07-15T09:20:00Z'
]) {
  assert.equal(serializedServerEvents.includes(forbidden), false, `Server measurements leaked: ${forbidden}`);
}

console.log('Navigator v2 privacy-safe UX measurement semantic checks passed');
