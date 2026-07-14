import assert from 'node:assert/strict';
import {
  buildDealsWorkspace,
  dealMatchesWorkMode,
  hasMissingResponsibility,
  isOverdueDeal,
  needsWorkAttention
} from '../assets/js/nav-v2/deals-work-modes-v2.js';

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
    missing_documents_count: 0,
    readiness_deposit: 60,
    readiness_deal: 50,
    next_action: 'Позвонить клиенту',
    created_at: '2026-01-01T10:00:00Z',
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

const overdue = deal({
  id: 'overdue',
  address: 'Просроченная 1',
  display_title: 'Дом — Просроченная 1',
  overdue_tasks_count: 4,
  red_risks_count: 1,
  readiness_deposit: 70
});
const unassigned = deal({
  id: 'unassigned',
  address: 'Без ответственного 1',
  display_title: 'Квартира — Без ответственного 1',
  manager: null,
  seller_spn: null,
  buyer_spn: null,
  lawyer_needed: true,
  lawyer: null,
  missing_documents_count: 6
});
const ready = deal({
  id: 'ready',
  address: 'Готовая 1',
  display_title: 'Квартира — Готовая 1',
  readiness_deposit: 90
});
const duplicateOld = deal({
  id: 'duplicate-old',
  address: 'Дубль 1',
  display_title: 'Квартира — Дубль 1',
  created_at: '2026-01-01T09:00:00Z',
  buyer_phone: '+72222222222',
  seller_phone: '+73333333333'
});
const duplicateNew = { ...duplicateOld, id: 'duplicate-new', created_at: '2026-01-01T09:00:06Z' };
const demo = deal({ id: 'demo', title: 'ДЕМО: тестовая сделка', display_title: 'ДЕМО: тестовая сделка' });

assert.equal(isOverdueDeal(overdue), true, 'Overdue mode must use overdue_tasks_count');
assert.equal(hasMissingResponsibility(unassigned), true, 'Missing SPN/manager/lawyer must be visible');
assert.equal(needsWorkAttention(overdue), true, 'Overdue deal must require attention');
assert.equal(needsWorkAttention(unassigned), true, 'Unassigned deal must require attention');
assert.equal(dealMatchesWorkMode(ready, 'deposit'), true, '80%+ deposit readiness must match deposit mode');
assert.equal(dealMatchesWorkMode(overdue, 'overdue'), true);
assert.equal(dealMatchesWorkMode(unassigned, 'unassigned'), true);

const owner = buildDealsWorkspace([demo, duplicateNew, ready, overdue, unassigned, duplicateOld], 'owner');
assert.equal(owner.hiddenDemoCount, 1, 'Demo rows must be hidden from working modes');
assert.equal(owner.hiddenDuplicateCount, 1, 'Exact duplicates must collapse in working modes');
assert.equal(owner.workingDealCount, 4, 'Four canonical work deals must remain');
assert.equal(owner.canonicalDeals.some((item) => item.id === 'duplicate-old'), true, 'Earliest duplicate must remain');
assert.equal(owner.canonicalDeals.some((item) => item.id === 'duplicate-new'), false, 'Later exact duplicate must be hidden');
assert.deepEqual(owner.quickModes.map((item) => item.key), ['work', 'attention', 'overdue', 'unassigned', 'deposit']);
assert.equal(owner.counts.overdue, 1);
assert.equal(owner.counts.unassigned, 1);
assert.equal(owner.counts.deposit, 1);
assert.equal(owner.counts.attention, 2);

const spn = buildDealsWorkspace([ready, overdue, unassigned], 'spn');
assert.deepEqual(spn.quickModes.map((item) => item.key), ['work', 'attention', 'overdue', 'docs', 'deposit']);

const lawyer = buildDealsWorkspace([ready, overdue, unassigned], 'lawyer');
assert.deepEqual(lawyer.quickModes.map((item) => item.key), ['lawyer', 'red', 'overdue', 'docs']);
assert.equal(lawyer.counts.lawyer, 1, 'Lawyer queue must include required unassigned legal review');

const brokerDeal = deal({ id: 'broker', broker_needed: true, broker: null, has_mortgage: true });
const broker = buildDealsWorkspace([brokerDeal, ready], 'broker');
assert.deepEqual(broker.quickModes.map((item) => item.key), ['broker', 'overdue', 'unassigned', 'deposit']);
assert.equal(broker.counts.broker, 1);

console.log('Navigator v2 deals work modes semantic checks passed');
