import assert from 'node:assert/strict';
import {
  buildManagerConfirmedResult,
  managerResultCandidate,
  sortManagerConfirmedResults,
  summarizeManagerConfirmedResults
} from '../assets/js/nav-v2/manager-confirmed-results-model-v2.js';

const now = '2026-07-15T12:00:00Z';
const profile = { id: 'owner-1', role: 'owner', full_name: 'Алексей Ковтун' };
const item = {
  deal_id: 'deal-1',
  title: 'Квартира — Чкалова, 4',
  card_url: './deal-card-v2.html?id=deal-1',
  last_activity_at: '2026-07-15T10:00:00Z'
};
const deal = {
  id: 'deal-1',
  status: 'preparing_deal',
  next_action: 'Назначить дату сделки',
  manager_id: 'manager-1',
  seller_spn_id: 'spn-1'
};

assert.equal(managerResultCandidate(item, { now, maxAgeDays: 7 }), true);
assert.equal(managerResultCandidate({ ...item, last_activity_at: '2026-07-01T10:00:00Z' }, { now, maxAgeDays: 7 }), false);

const todayResult = buildManagerConfirmedResult(item, {
  deal,
  tasks: [
    { id: 'task-done', title: 'Проверить пакет', status: 'done', completed_by: 'owner-1' },
    { id: 'task-next', title: 'Согласовать дату', status: 'open', priority: 'urgent', due_date: '2026-07-16', assigned_role: 'manager' }
  ],
  documents: [],
  risks: [],
  events: [{
    id: 'event-task',
    actor_id: 'owner-1',
    event_type: 'task_status_changed',
    created_at: '2026-07-15T10:00:00Z',
    event_data: { task_id: 'task-done', old_status: 'open', status: 'done' }
  }]
}, profile, { now, maxAgeDays: 7, timeZone: 'Europe/Moscow' });

assert.equal(todayResult.visible, true);
assert.equal(todayResult.window, 'today');
assert.equal(todayResult.kind, 'task');
assert.equal(todayResult.actor, 'Алексей Ковтун');
assert.match(todayResult.resultTitle, /Проверить пакет/);
assert.equal(todayResult.nextAction.title, 'Согласовать дату');
assert.equal(todayResult.nextAction.responsible, 'Менеджер');
assert.equal(todayResult.nextHref, './deal-card-v2.html?id=deal-1#tasks');
assert.match(todayResult.serverFact, /текущий статус задачи на сервере/);

const recentResult = buildManagerConfirmedResult({
  ...item,
  deal_id: 'deal-2',
  title: 'Дом — Прибрежная, 1',
  card_url: './deal-card-v2.html?id=deal-2',
  last_activity_at: '2026-07-14T18:00:00Z'
}, {
  deal: { ...deal, id: 'deal-2' },
  tasks: [],
  documents: [{ id: 'doc-1', title: 'Выписка ЕГРН', status: 'checked', checked_by: 'lawyer-1', responsible_role: 'lawyer' }],
  risks: [],
  events: [{
    id: 'event-doc',
    actor_id: 'lawyer-1',
    event_type: 'document_workflow_updated',
    created_at: '2026-07-14T18:00:00Z',
    event_data: { document_id: 'doc-1', old_status: 'received', status: 'checked' }
  }]
}, profile, { now, maxAgeDays: 7, timeZone: 'Europe/Moscow' });

assert.equal(recentResult.visible, true);
assert.equal(recentResult.window, 'recent', 'Previous Moscow calendar day must not be shown as today');
assert.equal(recentResult.kind, 'document');
assert.equal(recentResult.actor, 'Юрист');

const noOp = buildManagerConfirmedResult(item, {
  deal,
  tasks: [],
  documents: [{ id: 'doc-1', title: 'Выписка ЕГРН', status: 'checked' }],
  risks: [],
  events: [{
    id: 'event-doc-noop',
    actor_id: 'lawyer-1',
    event_type: 'document_workflow_updated',
    created_at: '2026-07-15T09:00:00Z',
    event_data: { document_id: 'doc-1', old_status: 'checked', status: 'checked' }
  }]
}, profile, { now, maxAgeDays: 7, timeZone: 'Europe/Moscow' });
assert.equal(noOp.visible, false, 'Assignment-only/no-op event must not masquerade as completed work');

const stale = buildManagerConfirmedResult(item, {
  deal,
  tasks: [{ id: 'task-done', title: 'Старая задача', status: 'done' }],
  documents: [],
  risks: [],
  events: [{
    event_type: 'task_status_changed',
    created_at: '2026-07-01T10:00:00Z',
    event_data: { task_id: 'task-done', old_status: 'open', status: 'done' }
  }]
}, profile, { now, maxAgeDays: 7, timeZone: 'Europe/Moscow' });
assert.equal(stale.visible, false);

const sorted = sortManagerConfirmedResults([recentResult, todayResult, noOp]);
assert.deepEqual(sorted.map((result) => result.dealId), ['deal-1', 'deal-2']);
assert.deepEqual(summarizeManagerConfirmedResults(sorted), { today: 1, sevenDays: 2 });

console.log('Navigator v2 manager confirmed results semantic checks passed');
