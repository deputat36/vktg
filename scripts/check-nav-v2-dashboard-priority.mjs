import assert from 'node:assert/strict';
import {
  buildDashboardFocus,
  dashboardDuplicateKey,
  isDashboardDemoDeal
} from '../assets/js/nav-v2/dashboard-priority-v2.js';

function deal(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    title: 'Рабочая сделка',
    display_title: 'Квартира — Пушкина 1',
    address: 'Пушкина 1',
    object_type: 'flat_mkd',
    status: 'draft',
    risk_level: 'yellow',
    red_risks_count: 0,
    yellow_risks_count: 1,
    open_tasks_count: 1,
    overdue_tasks_count: 0,
    missing_documents_count: 1,
    readiness_deposit: 50,
    readiness_deal: 40,
    next_action: 'Позвонить клиенту',
    next_task_due_date: '2099-01-01',
    created_at: '2026-01-01T10:00:00Z',
    last_activity_at: '2026-01-01T10:00:00Z',
    buyer_phone: '+70000000000',
    seller_phone: '+71111111111',
    buyer_name: 'Покупатель',
    seller_name: 'Продавец',
    price_total: 3000000,
    lawyer_needed: false,
    broker_needed: false,
    manager: 'Менеджер',
    seller_spn: 'СПН',
    buyer_spn: null,
    lawyer: null,
    broker: null,
    ...overrides
  };
}

const urgent = deal({
  id: 'urgent',
  display_title: 'Дом — Красная 1',
  address: 'Красная 1',
  red_risks_count: 2,
  overdue_tasks_count: 5,
  open_tasks_count: 5,
  missing_documents_count: 8,
  lawyer_needed: true,
  manager: null,
  next_action: 'Передать юристу'
});

const duplicateOld = deal({
  id: 'duplicate-old',
  created_at: '2026-01-01T09:00:00Z',
  display_title: 'Квартира — Дубль 1',
  address: 'Дубль 1',
  buyer_phone: '+72222222222',
  seller_phone: '+73333333333'
});
const duplicateNew = { ...duplicateOld, id: 'duplicate-new', created_at: '2026-01-01T09:00:06Z' };
const demo = deal({ id: 'demo', title: 'ДЕМО: тестовая сделка', display_title: 'ДЕМО: тестовая сделка' });
const closed = deal({ id: 'closed', status: 'closed', address: 'Закрытая 1', display_title: 'Квартира — Закрытая 1' });
const calm = deal({ id: 'calm', address: 'Спокойная 1', display_title: 'Квартира — Спокойная 1', readiness_deposit: 90, missing_documents_count: 0, yellow_risks_count: 0 });

assert.equal(isDashboardDemoDeal(demo), true, 'Demo title must be excluded');
assert.equal(dashboardDuplicateKey(duplicateOld), dashboardDuplicateKey(duplicateNew), 'Exact duplicate fingerprint must be stable');

const owner = buildDashboardFocus([demo, duplicateNew, urgent, closed, calm, duplicateOld], 'owner', 3);
assert.equal(owner.hiddenDemoCount, 1, 'One demo card must be hidden');
assert.equal(owner.hiddenDuplicateCount, 1, 'One exact duplicate must be collapsed');
assert.equal(owner.workingDealCount, 3, 'Only three canonical working deals should remain');
assert.equal(owner.items[0].deal.id, 'urgent', 'Red risks and overdue tasks must lead the priority list');
assert.equal(owner.canonicalDeals.some((item) => item.id === 'duplicate-old'), true, 'Earliest exact duplicate must be retained');
assert.equal(owner.canonicalDeals.some((item) => item.id === 'duplicate-new'), false, 'Later exact duplicate must be hidden');
assert.equal(owner.items[0].reasons.some((item) => item.text.includes('Красных рисков')), true, 'Priority must explain red risks');
assert.equal(owner.items[0].reasons.some((item) => item.text.includes('Просроченных задач')), true, 'Priority must explain overdue tasks');
assert.equal(owner.items[0].actionTitle, 'Назначить ответственного', 'Owner must see missing responsibility as the first action');
assert.equal(owner.totals.redRisks, 2, 'Totals must exclude demo, closed and duplicate rows');
assert.equal(owner.totals.overdueTasks, 5, 'Overdue totals must use canonical working deals');

const lawyerNeeded = deal({
  id: 'lawyer-needed',
  address: 'Юридическая 1',
  display_title: 'Дом — Юридическая 1',
  lawyer_needed: true,
  lawyer: null,
  red_risks_count: 1,
  missing_documents_count: 10
});
const lawyerCalm = deal({ id: 'lawyer-calm', address: 'Юридическая 2', display_title: 'Квартира — Юридическая 2' });
const lawyer = buildDashboardFocus([lawyerCalm, lawyerNeeded], 'lawyer', 1);
assert.equal(lawyer.items[0].deal.id, 'lawyer-needed', 'Lawyer workspace must prioritize legal gaps');
assert.equal(lawyer.items[0].actionTitle, 'Проверить стоп-фактор');

const viewer = buildDashboardFocus([urgent], 'viewer', 1);
assert.equal(viewer.items[0].actionTitle, 'Посмотреть причину', 'Viewer must receive a read-only action label');

console.log('Navigator v2 dashboard priority semantic checks passed');
