import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildConsultationHandoff,
  buildWizardDraftFromConsultation,
  consultationResponseOptions,
  routeConsultationIntake,
  validateConsultationIntake
} from '../assets/js/nav-v2/consultation-intake-model-v2.js';

const fixtureUrl = new URL('../fixtures/nav-v2-consultation-intake-scenarios.json', import.meta.url);
const fixtures = JSON.parse(await readFile(fixtureUrl, 'utf8'));

assert.equal(fixtures.status, 'synthetic_only');
assert.equal(fixtures.production_applied, false);
assert.equal(fixtures.scenarios.length, 12);

const forbiddenDraftKeys = new Set([
  'sellerName', 'seller_name', 'sellerPhone', 'seller_phone',
  'buyerName', 'buyer_name', 'buyerPhone', 'buyer_phone',
  'clientName', 'clientPhone', 'email', 'passport', 'snils', 'cadastralNumber'
]);

for (const scenario of fixtures.scenarios) {
  const validation = validateConsultationIntake(scenario.input);
  assert.equal(validation.valid, scenario.expected.valid, `${scenario.id}: validation mismatch`);

  if (!scenario.expected.valid) {
    assert.ok(
      validation.errors.some((item) => item.includes(scenario.expected.errorContains)),
      `${scenario.id}: expected error ${scenario.expected.errorContains}; actual ${validation.errors.join(' | ')}`
    );
    continue;
  }

  const route = routeConsultationIntake(scenario.input);
  if ('brokerNeeded' in scenario.expected) assert.equal(route.brokerNeeded, scenario.expected.brokerNeeded, `${scenario.id}: broker route`);
  if ('legalFunding' in scenario.expected) assert.equal(route.legalFunding, scenario.expected.legalFunding, `${scenario.id}: legal funding route`);
  if ('stopBeforeDeposit' in scenario.expected) assert.equal(route.stopBeforeDeposit, scenario.expected.stopBeforeDeposit, `${scenario.id}: stop gate`);
  if ('urgent' in scenario.expected) assert.equal(route.urgent, scenario.expected.urgent, `${scenario.id}: urgent route`);
  assert.equal(route.primaryRole, 'lawyer', `${scenario.id}: legal consultation primary role`);
  assert.equal(route.backlogPolicy, 'no_auto_backlog_before_route_confirmation', `${scenario.id}: backlog policy`);

  const handoff = buildConsultationHandoff(scenario.input);
  assert.equal(handoff.valid, true, `${scenario.id}: handoff`);
  assert.match(handoff.text, /БЫСТРАЯ ЮРИДИЧЕСКАЯ КОНСУЛЬТАЦИЯ/);
  assert.match(handoff.text, /не автоматическое юридическое заключение/i);
  assert.match(handoff.text, /Полный список документов и задач создаётся только после подтверждения маршрута/i);

  const wizard = buildWizardDraftFromConsultation(scenario.input);
  assert.equal(wizard.valid, true, `${scenario.id}: wizard transfer`);
  if (scenario.expected.conversionMode) assert.equal(wizard.draft.preparationMode, scenario.expected.conversionMode, `${scenario.id}: conversion mode`);
  for (const key of Object.keys(wizard.draft)) {
    assert.equal(forbiddenDraftKeys.has(key), false, `${scenario.id}: forbidden draft key ${key}`);
  }
  const serialized = JSON.stringify(wizard.draft);
  assert.doesNotMatch(serialized, /(?:seller|buyer|client)(?:Name|Phone|_name|_phone)/i, `${scenario.id}: client identifier leaked into draft`);
}

const matcap = routeConsultationIntake({ payments: ['matcap'] });
assert.equal(matcap.brokerNeeded, false);
assert.equal(matcap.legalFunding, true);

const certificate = routeConsultationIntake({ payments: ['certificate'] });
assert.equal(certificate.brokerNeeded, false);
assert.equal(certificate.legalFunding, true);

const mortgageMatcap = routeConsultationIntake({ payments: ['mortgage', 'matcap'] });
assert.equal(mortgageMatcap.brokerNeeded, true);
assert.equal(mortgageMatcap.legalFunding, true);
assert.match(mortgageMatcap.brokerAction, /консультации, подбора программы и одобрения/i);

assert.deepEqual(
  consultationResponseOptions().map((item) => item.value),
  ['answer', 'need_info', 'convert_to_preparation']
);

console.log(`Navigator v2 consultation intake semantic regression passed: ${fixtures.scenarios.length} synthetic scenarios`);
