import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { matchedIntakeRules } from '../assets/js/nav-v2/spn-intake-contract-v1.js';
import { buildIntakeWorkPlan } from '../assets/js/nav-v2/spn-intake-work-plan-v1.js';

const root = new URL('../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('config/nav-v2-intake-contract-v1.json', root), 'utf8'));
const fixtures = JSON.parse(await readFile(new URL('tests/fixtures/nav-v2-intake-work-plan-v1.json', root), 'utf8'));

const base = {
  requestType: 'capture_situation',
  representation: 'seller',
  stage: 'object_chosen',
  objectType: 'flat_mkd',
  objectAddress: 'Рабочий ориентир',
  urgency: 'normal',
  targetDate: '2026-07-25',
  dateUnknown: false,
  nextAction: 'Уточнить безопасные статусы.',
  facts: {},
  documents: []
};

function mergeDraft(patch) {
  return {
    ...base,
    ...patch,
    facts: { ...base.facts, ...(patch?.facts || {}) },
    documents: [...(patch?.documents || [])],
    owners: { ...(patch?.owners || {}) }
  };
}

function ids(items, key = 'rule_id') {
  return items.map((item) => item[key]).sort();
}

for (const fixture of fixtures.scenarios) {
  const draft = mergeDraft(fixture.patch);
  const rules = matchedIntakeRules(draft, catalog);
  const plan = buildIntakeWorkPlan(draft, catalog, rules);
  const expect = fixture.expect || {};
  const documentIds = ids(plan.document_candidates, 'type');
  const skippedIds = ids(plan.skipped_documents, 'type');
  const candidateIds = ids(plan.task_candidates);
  const readyIds = ids(plan.ready_tasks);

  for (const type of expect.documents || []) assert.ok(documentIds.includes(type), `${fixture.id}: missing document ${type}`);
  for (const type of expect.excluded_documents || []) assert.ok(!documentIds.includes(type), `${fixture.id}: unexpected document ${type}`);
  for (const type of expect.skipped_documents || []) assert.ok(skippedIds.includes(type), `${fixture.id}: missing skipped document ${type}`);
  if (expect.task_candidates) assert.deepEqual(candidateIds, [...expect.task_candidates].sort(), `${fixture.id}: task candidates`);
  if (expect.ready_tasks) assert.deepEqual(readyIds, [...expect.ready_tasks].sort(), `${fixture.id}: ready tasks`);
  if (expect.broker_tasks) assert.deepEqual(ids(plan.task_candidates.filter((task) => task.owner.role === 'broker')), [...expect.broker_tasks].sort(), `${fixture.id}: broker scope`);
  if (expect.lawyer_tasks) assert.deepEqual(ids(plan.task_candidates.filter((task) => task.owner.role === 'lawyer')), [...expect.lawyer_tasks].sort(), `${fixture.id}: lawyer scope`);
  if (expect.needs_owner) assert.deepEqual(ids(plan.task_candidates.filter((task) => task.creation_state === 'needs_owner')), [...expect.needs_owner].sort(), `${fixture.id}: owner gate`);

  for (const task of plan.task_candidates) {
    assert.ok(task.owner.role, `${fixture.id}: task owner role`);
    assert.ok(task.action, `${fixture.id}: task action`);
    assert.ok(task.deadline_rule, `${fixture.id}: task deadline rule`);
    assert.ok(task.evidence, `${fixture.id}: task evidence`);
    assert.ok(task.expected_result, `${fixture.id}: task expected result`);
    assert.notEqual(task.action.toLowerCase(), 'проверить документы', `${fixture.id}: generic task forbidden`);
  }
  assert.ok(plan.ready_tasks.every((task) => task.owner.id && task.creation_state === 'ready'), `${fixture.id}: unassigned task became ready`);
}

const seller = buildIntakeWorkPlan(
  mergeDraft(fixtures.scenarios.find((item) => item.id === 'seller_minor_side_only').patch),
  catalog,
  matchedIntakeRules(mergeDraft(fixtures.scenarios.find((item) => item.id === 'seller_minor_side_only').patch), catalog)
);
assert.equal(seller.document_candidates.find((item) => item.type === 'guardianship_permission').allowed_link, 'https://files.example.test/folder');
assert.equal(seller.document_candidates.find((item) => item.type === 'child_ownership_status').allowed_link, null, 'query-bearing link must not enter plan');

const serialized = JSON.stringify(fixtures);
for (const forbidden of ['passport_number', 'phone', 'bank_card', 'snils', 'document_content']) {
  assert.equal(serialized.includes(forbidden), false, `fixtures must not contain ${forbidden}`);
}

console.log(`Navigator v2 intake work plan passed: ${fixtures.scenarios.length} side-aware document/task scenarios, owner gate, mortgage-only broker scope and safe links`);
