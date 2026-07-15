import assert from 'node:assert/strict';
import {
  buildSpnReworkModel,
  buildSpnReworkReturnComment
} from '../assets/js/nav-v2/deal-card-spn-rework-model-v2.js';

function baseDeal(status = 'need_info') {
  return {
    id: 'deal-1',
    status,
    title: 'Рабочая сделка',
    seller_name: '',
    buyer_name: 'Покупатель',
    address: 'Адрес',
    object_type: 'flat_mkd',
    manager_id: 'manager-1',
    seller_spn_id: 'spn-1',
    buyer_spn_id: null,
    lawyer_needed: true,
    lawyer_id: 'lawyer-1',
    broker_needed: false,
    settlements_agreed: true,
    expenses_agreed: true,
    next_action: 'Получить выписку'
  };
}

function returnedCard(overrides = {}) {
  return {
    deal: { ...baseDeal(), ...(overrides.deal || {}) },
    documents: overrides.documents || [{ id: 'doc-1', title: 'Выписка', is_required: true, status: 'requested' }],
    risks: overrides.risks || [],
    tasks: overrides.tasks || [],
    events: overrides.events || [{
      id: 'event-return',
      event_type: 'returned_to_spn_rework',
      actor_id: 'manager-1',
      created_at: '2026-07-15T09:00:02Z'
    }],
    comments: overrides.comments || [{
      id: 'comment-return',
      author_id: 'manager-1',
      created_at: '2026-07-15T09:00:01Z',
      body: [
        'Карточку вернул: Менеджер.',
        'Причина возврата: Нельзя передавать без продавца и выписки.',
        '',
        'Что нужно исправить:',
        '1. Данные сторон и объекта. Заполнить имя продавца.',
        '2. Документы. Получить и приложить выписку.',
        '3. Следующий шаг. Уточнить следующий шаг сделки.'
      ].join('\n')
    }]
  };
}

const spn = { id: 'spn-1', role: 'spn', full_name: 'Тестовый СПН' };
const manager = { id: 'manager-1', role: 'manager', full_name: 'Тестовый менеджер' };
const lawyer = { id: 'lawyer-1', role: 'lawyer', full_name: 'Тестовый юрист' };

{
  const model = buildSpnReworkModel(returnedCard(), spn);
  assert.equal(model.phase, 'fix');
  assert.equal(model.returnedBy, 'Менеджер');
  assert.equal(model.reason, 'Нельзя передавать без продавца и выписки.');
  assert.equal(model.canSubmit, true);
  assert.equal(model.readyToSubmit, false);
  assert.equal(model.unresolvedCount, 2);
  assert.deepEqual(model.remarks.map((item) => item.category), ['parties', 'documents', 'next_action']);
  assert.equal(model.remarks.find((item) => item.category === 'next_action').state, 'resolved');
  assert.equal(model.firstRoute.target, 'partySummaryV2');
}

{
  const corrected = returnedCard({
    deal: { seller_name: 'Продавец' },
    documents: [{ id: 'doc-1', title: 'Выписка', is_required: true, status: 'received' }]
  });
  const model = buildSpnReworkModel(corrected, spn);
  assert.equal(model.readyToSubmit, true);
  assert.equal(model.unresolvedCount, 0);
  assert.ok(model.remarks.every((item) => item.state === 'resolved'));
}

{
  const submitted = returnedCard({
    deal: { ...baseDeal('need_lawyer'), seller_name: 'Продавец' },
    documents: [{ id: 'doc-1', is_required: true, status: 'received' }],
    tasks: [{ id: 'task-lawyer', status: 'open', assigned_role: 'lawyer', due_date: '2026-07-17' }],
    events: [
      { id: 'submit', event_type: 'spn_rework_submitted', actor_id: 'spn-1', created_at: '2026-07-15T10:00:02Z' },
      { id: 'return', event_type: 'returned_to_spn_rework', actor_id: 'manager-1', created_at: '2026-07-15T09:00:02Z' }
    ],
    comments: [{
      id: 'submit-comment',
      author_id: 'spn-1',
      created_at: '2026-07-15T10:00:01Z',
      body: 'Добавлено имя продавца, получена выписка, сохранён следующий шаг.'
    }]
  });
  const model = buildSpnReworkModel(submitted, spn);
  assert.equal(model.phase, 'submitted');
  assert.equal(model.recipient, 'Назначенному юристу');
  assert.equal(model.newStatus, 'Юрист');
  assert.equal(model.nextOwner, 'Назначенный юрист');
  assert.equal(model.nextDueDate, '2026-07-17');
  assert.match(model.completionComment, /Добавлено имя продавца/);
  assert.equal(model.submittedBy, 'Тестовый СПН');
}

{
  const data = returnedCard({
    deal: {
      ...baseDeal('draft'),
      manager_id: null,
      lawyer_id: null,
      next_action: '',
      expenses_agreed: false
    }
  });
  const model = buildSpnReworkModel(data, manager, Date.parse('2026-07-15T12:00:00Z'));
  assert.equal(model.phase, 'return');
  assert.equal(model.returner, 'Менеджер');
  const suggested = model.options.filter((option) => option.suggested).map((option) => option.id);
  assert.ok(suggested.includes('parties'));
  assert.ok(suggested.includes('documents'));
  assert.ok(suggested.includes('expenses'));
  assert.ok(suggested.includes('next_action'));
  assert.ok(suggested.includes('responsibility'));
  const comment = buildSpnReworkReturnComment(model, ['documents', 'responsibility'], 'Нужен полный пакет и ответственный.');
  assert.match(comment, /Карточку вернул: Менеджер\./);
  assert.match(comment, /Причина возврата: Нужен полный пакет и ответственный\./);
  assert.match(comment, /1\. Документы\./);
  assert.match(comment, /2\. Ответственные и срок\./);
}

{
  const completedCycle = returnedCard({
    deal: { ...baseDeal('need_lawyer'), seller_name: 'Продавец' },
    events: [
      { id: 'later-status', event_type: 'status_changed', created_at: '2026-07-15T11:00:00Z' },
      { id: 'submit', event_type: 'spn_rework_submitted', created_at: '2026-07-15T10:00:00Z' }
    ]
  });
  assert.equal(buildSpnReworkModel(completedCycle, lawyer).phase, 'return');
}

{
  const legacyNeedInfo = returnedCard({ events: [], comments: [] });
  const model = buildSpnReworkModel(legacyNeedInfo, spn);
  assert.equal(model.phase, 'fix');
  assert.equal(model.returnedBy, 'Не зафиксировано в карточке');
  assert.ok(model.remarks.some((item) => item.source === 'current_card'));
}

console.log('Navigator v2 SPN rework cycle semantic checks passed');
