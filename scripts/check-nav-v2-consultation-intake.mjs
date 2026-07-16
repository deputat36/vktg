import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateConsultation, routeConsultation, buildHandoff, buildWizardDraft, responseOptions } from '../assets/js/nav-v2/consultation-intake-model-v2.js';

const fixtures = JSON.parse(await readFile(new URL('../fixtures/nav-v2-consultation-intake-scenarios.json', import.meta.url), 'utf8'));
assert.equal(fixtures.status, 'synthetic_only');
assert.equal(fixtures.production_applied, false);
assert.equal(fixtures.scenarios.length, 10);
const forbidden = /(?:seller|buyer|client)(?:Name|Phone|_name|_phone)/i;

for (const scenario of fixtures.scenarios) {
  const validation = validateConsultation(scenario.input);
  assert.equal(validation.valid, scenario.expected.valid, `${scenario.id}: validation`);
  if (!validation.valid) {
    assert.ok(validation.errors.some((item) => item.includes(scenario.expected.errorContains)), `${scenario.id}: ${validation.errors.join(' | ')}`);
    continue;
  }
  const route = routeConsultation(scenario.input);
  for (const key of ['brokerNeeded', 'legalFunding', 'stopBeforeDeposit', 'urgent']) {
    if (key in scenario.expected) assert.equal(route[key], scenario.expected[key], `${scenario.id}: ${key}`);
  }
  assert.equal(route.primaryRole, 'lawyer');
  assert.equal(route.backlogPolicy, 'no_auto_backlog_before_route_confirmation');
  const handoff = buildHandoff(scenario.input);
  assert.equal(handoff.valid, true);
  assert.match(handoff.text, /не автоматическое юридическое заключение/i);
  assert.match(handoff.text, /только после подтверждения маршрута/i);
  const draft = buildWizardDraft(scenario.input);
  assert.equal(draft.valid, true);
  if (scenario.expected.conversionMode) assert.equal(draft.draft.preparationMode, scenario.expected.conversionMode);
  assert.doesNotMatch(JSON.stringify(draft.draft), forbidden);
}

assert.equal(routeConsultation({ payments: ['matcap'] }).brokerNeeded, false);
assert.equal(routeConsultation({ payments: ['certificate'] }).brokerNeeded, false);
assert.equal(routeConsultation({ payments: ['mortgage', 'matcap'] }).brokerNeeded, true);
assert.deepEqual(responseOptions().map(([value]) => value), ['answer', 'need_info', 'convert_to_preparation']);
console.log(`Navigator v2 consultation intake semantic regression passed: ${fixtures.scenarios.length} scenarios`);
