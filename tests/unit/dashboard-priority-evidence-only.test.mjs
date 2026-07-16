import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildWorkingDealSet,
  dashboardDuplicateKey
} from '../../assets/js/nav-v2/dashboard-priority-v2.js';

function deal(id, overrides = {}) {
  return {
    id,
    status: 'draft',
    created_at: `2026-07-16T08:00:0${id}.000Z`,
    title: 'Квартира — безопасный ориентир',
    display_title: 'Сделка',
    address: 'район Северный',
    object_type: 'flat_mkd',
    buyer_name: 'Клиент',
    seller_name: 'Собственник',
    buyer_phone: '+70000000000',
    seller_phone: '+71111111111',
    next_action: 'Собрать документы',
    price_total: 3500000,
    ...overrides
  };
}

assert.equal(
  dashboardDuplicateKey(deal('1')),
  '',
  'legacy fields must not create duplicate evidence'
);

const legacyLookalikes = buildWorkingDealSet([
  deal('1'),
  deal('2')
]);
assert.equal(legacyLookalikes.canonicalDeals.length, 2);
assert.equal(legacyLookalikes.hiddenDuplicateCount, 0);

const confirmedDuplicates = buildWorkingDealSet([
  deal('1', { exact_duplicate_group_id: 'GROUP-42' }),
  deal('2', { exact_duplicate_group_id: 'group-42' })
]);
assert.equal(confirmedDuplicates.canonicalDeals.length, 1);
assert.equal(confirmedDuplicates.hiddenDuplicateCount, 1);
assert.equal(confirmedDuplicates.canonicalDeals[0].id, '1');

const separateEvidence = buildWorkingDealSet([
  deal('1', { exact_duplicate_group_id: 'group-a' }),
  deal('2', { exact_duplicate_group_id: 'group-b' })
]);
assert.equal(separateEvidence.canonicalDeals.length, 2);
assert.equal(separateEvidence.hiddenDuplicateCount, 0);

const demoIsSeparate = buildWorkingDealSet([
  deal('1', { exact_duplicate_group_id: 'group-a' }),
  deal('2', { title: 'ДЕМО: учебная карточка', exact_duplicate_group_id: 'group-a' })
]);
assert.equal(demoIsSeparate.hiddenDemoCount, 1);
assert.equal(demoIsSeparate.hiddenDuplicateCount, 0);
assert.equal(demoIsSeparate.canonicalDeals.length, 1);

const closedIsSeparate = buildWorkingDealSet([
  deal('1', { exact_duplicate_group_id: 'group-a' }),
  deal('2', { status: 'completed', exact_duplicate_group_id: 'group-a' })
]);
assert.equal(closedIsSeparate.activeDeals.length, 1);
assert.equal(closedIsSeparate.hiddenDuplicateCount, 0);
assert.equal(closedIsSeparate.canonicalDeals.length, 1);

const source = await readFile(new URL('../../assets/js/nav-v2/dashboard-priority-v2.js', import.meta.url), 'utf8');
for (const forbidden of ['buyer_phone', 'seller_phone', 'buyer_name', 'seller_name']) {
  assert.equal(source.includes(forbidden), false, `${forbidden} must not participate in frontend duplicate grouping`);
}

console.log('dashboard priority evidence-only duplicate tests: PASS');
