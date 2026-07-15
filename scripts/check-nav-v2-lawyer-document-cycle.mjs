import assert from 'node:assert/strict';
import { buildLawyerDocumentCycle } from '../assets/js/nav-v2/deal-card-lawyer-document-cycle-model-v2.js';

const lawyer = { id: 'lawyer-1', role: 'lawyer', full_name: 'Тестовый юрист' };

function document(overrides = {}) {
  return {
    id: 'doc-needed',
    title: 'Выписка ЕГРН',
    side: 'seller',
    category: 'basis',
    description: 'Подтверждает право продавца на объект.',
    required_for_deposit: true,
    required_for_deal: true,
    status: 'needed',
    responsible_role: 'spn',
    assigned_to: 'spn-1',
    due_date: '2026-07-16',
    updated_at: '2026-07-14T09:00:00Z',
    can_change_status: true,
    can_mark_received: true,
    can_mark_checked: true,
    can_mark_problem: true,
    ...overrides
  };
}

function card(documents, events = []) {
  return {
    profile: lawyer,
    deal: { id: 'deal-1', title: 'Рабочая сделка' },
    participants: [{ user_id: 'spn-1', display_name: 'Тестовый СПН', role_in_deal: 'seller_spn' }],
    documents,
    events
  };
}

const documents = [
  document({ id: 'doc-needed' }),
  document({ id: 'doc-requested', title: 'Справка о зарегистрированных', status: 'requested', due_date: '2026-07-14', requested_at: '2026-07-11T08:00:00Z' }),
  document({ id: 'doc-received', title: 'Паспорт продавца', status: 'received', due_date: '2026-07-15', last_status_changed_at: '2026-07-15T08:30:00Z' }),
  document({ id: 'doc-problem', title: 'Согласие супруга', status: 'problem', problem_note: 'В документе неверно указан адрес.', due_date: '2026-07-14', last_status_changed_at: '2026-07-15T08:00:00Z' }),
  document({ id: 'doc-checked', title: 'Правоустанавливающий договор', status: 'checked', due_date: null, resolved_at: '2026-07-15T07:00:00Z' })
];

{
  const model = buildLawyerDocumentCycle(card(documents), lawyer, { now: '2026-07-15T12:00:00Z' });
  assert.equal(model.visible, true);
  assert.equal(model.focus.id, 'doc-problem');
  assert.equal(model.focus.side, 'Продавец');
  assert.equal(model.focus.why, 'Подтверждает право продавца на объект.');
  assert.equal(model.focus.blocking, 'Блокирует задаток и сделку');
  assert.equal(model.focus.owner, 'Тестовый СПН · СПН');
  assert.equal(model.focus.dueState, 'overdue');
  assert.equal(model.focus.note, 'В документе неверно указан адрес.');
  assert.deepEqual(model.focus.actions.map((item) => item.target), ['requested', 'received']);
  assert.equal(model.counts.problem, 1);
  assert.equal(model.counts.received, 1);
  assert.equal(model.counts.overdue, 2);
  assert.equal(model.counts.checked, 1);
}

{
  const model = buildLawyerDocumentCycle(card(documents), lawyer, {
    now: '2026-07-15T12:00:00Z',
    selectedId: 'doc-received'
  });
  assert.equal(model.focus.id, 'doc-received');
  assert.equal(model.focus.nextAction, 'Проверить и подтвердить');
  assert.deepEqual(model.focus.actions.map((item) => item.target), ['checked', 'problem']);
  assert.equal(model.focus.actions[1].requiresNote, true);
}

{
  const model = buildLawyerDocumentCycle(card(documents), lawyer, {
    now: '2026-07-15T12:00:00Z',
    selectedId: 'doc-needed'
  });
  assert.equal(model.focus.actions[0].target, 'requested');
  assert.equal(model.focus.nextAction, 'Отметить как запрошенный');
}

{
  const checked = documents.map((doc) => document({ ...doc, status: 'checked', problem_note: null }));
  const events = [{
    id: 'event-1',
    event_type: 'document_workflow_updated',
    created_at: '2026-07-15T10:00:00Z',
    event_data: { document_id: 'doc-received', status: 'checked' }
  }];
  const model = buildLawyerDocumentCycle(card(checked, events), lawyer, { now: '2026-07-15T12:00:00Z' });
  assert.equal(model.complete, true);
  assert.equal(model.completion.documentId, 'doc-received');
  assert.equal(model.completion.statusLabel, 'Проверен');
  assert.match(model.completion.next, /подтверждён/);
}

{
  const restricted = document({ can_change_status: false, can_mark_problem: false });
  const model = buildLawyerDocumentCycle(card([restricted]), lawyer, { now: '2026-07-15T12:00:00Z' });
  assert.deepEqual(model.focus.actions, []);
  assert.match(model.focus.nextAction, /Передайте действие ответственному/);
}

assert.equal(buildLawyerDocumentCycle(card(documents), { role: 'spn' }).visible, false);

console.log('Navigator v2 lawyer document cycle semantic checks passed');
