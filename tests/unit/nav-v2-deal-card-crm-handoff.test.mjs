import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildDealCardCrmHandoffModel } from '../../assets/js/nav-v2/deal-card-crm-handoff-model-v1.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '../../fixtures/nav-v2-deal-card-crm-handoff-scenarios.json');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));

for (const scenario of fixture.scenarios) {
  const model = buildDealCardCrmHandoffModel(scenario.data, scenario.profile);
  const expected = scenario.expect || {};
  const stage = model.fields.find((field) => field.key === 'stage')?.value;

  assert.equal(stage, expected.stage, `${scenario.id}: stage`);
  assert.equal(model.privacy.includes_client_identifiers, false, `${scenario.id}: privacy marker`);
  assert.equal(model.privacy.source, 'already_loaded_process_state', `${scenario.id}: source marker`);
  assert.match(model.copy_text, /^Текущий этап:/, `${scenario.id}: CRM structure starts with stage`);
  assert.match(model.copy_text, /\nРезультат:/, `${scenario.id}: result line`);
  assert.match(model.copy_text, /\nРиск или препятствие:/, `${scenario.id}: obstacle line`);
  assert.match(model.copy_text, /\nДоговорённость:/, `${scenario.id}: agreement line`);
  assert.match(model.copy_text, /\nНе хватает:/, `${scenario.id}: missing line`);
  assert.match(model.copy_text, /\nСледующее действие:/, `${scenario.id}: next action line`);

  if ('owner' in expected) assert.equal(model.next_action.owner_label, expected.owner, `${scenario.id}: owner`);
  if ('deadline' in expected) assert.equal(model.next_action.deadline, expected.deadline, `${scenario.id}: deadline`);
  if ('missing_documents' in expected) assert.equal(model.counts.missing_documents, expected.missing_documents, `${scenario.id}: missing documents`);
  if ('blocking_risks' in expected) assert.equal(model.counts.blocking_risks, expected.blocking_risks, `${scenario.id}: blocking risks`);
  if (expected.copy_contains) assert.match(model.copy_text, new RegExp(expected.copy_contains), `${scenario.id}: copy content`);

  for (const forbidden of expected.forbidden || []) {
    assert.equal(model.copy_text.includes(forbidden), false, `${scenario.id}: forbidden client identifier`);
  }
}

const minimal = buildDealCardCrmHandoffModel({ deal: {} }, null);
assert.equal(minimal.fields.length, 6, 'minimal: fixed compact CRM structure');
assert.match(minimal.copy_text, /ответственный не назначен|СПН/, 'minimal: owner is explicit');
assert.match(minimal.copy_text, /срок требуется уточнить/, 'minimal: unknown deadline is explicit');

console.log(`Navigator v2 CRM handoff regression passed: ${fixture.scenarios.length} scenarios, process-only copy and explicit owner/deadline`);
