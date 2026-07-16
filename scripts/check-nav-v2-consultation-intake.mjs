import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildConsultationHandoff,
  consultationRouting,
  consultationToWizardDraft,
  validateConsultationInput
} from '../assets/js/nav-v2/consultation-intake-model-v2.js?v=20260716-02';

const fixtureUrl = new URL('../fixtures/nav-v2-consultation-intake-scenarios.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
assert.equal(fixture.synthetic_only, true, 'fixtures must remain synthetic-only');
assert.ok(Array.isArray(fixture.cases) && fixture.cases.length >= 12, 'scenario matrix must contain at least 12 cases');

for (const scenario of fixture.cases) {
  const validation = validateConsultationInput(scenario.input);
  const routing = consultationRouting(scenario.input);
  assert.equal(validation.ok, scenario.expected.ok, `${scenario.id}: validation result`);
  if (Object.hasOwn(scenario.expected, 'broker_needed')) {
    assert.equal(routing.broker_needed, scenario.expected.broker_needed, `${scenario.id}: broker route`);
  }
  if (scenario.expected.lawyer_priority) {
    assert.equal(routing.lawyer_priority, scenario.expected.lawyer_priority, `${scenario.id}: lawyer priority`);
  }
  if (scenario.expected.legal_scope_contains) {
    assert.match(routing.legal_scope.toLowerCase(), new RegExp(scenario.expected.legal_scope_contains.toLowerCase()), `${scenario.id}: legal scope`);
  }
  if (scenario.expected.broker_scope_contains) {
    assert.match(routing.broker_scope.toLowerCase(), new RegExp(scenario.expected.broker_scope_contains.toLowerCase()), `${scenario.id}: broker scope`);
  }
  if (scenario.expected.privacy_type) {
    assert.ok(validation.privacy.some((item) => item.type === scenario.expected.privacy_type), `${scenario.id}: privacy finding ${scenario.expected.privacy_type}`);
  }
  if (scenario.expected.error_contains) {
    assert.ok(validation.errors.some((item) => item.includes(scenario.expected.error_contains)), `${scenario.id}: expected error text`);
  }
  if (validation.ok) {
    const handoff = buildConsultationHandoff(scenario.input);
    assert.equal(handoff.ok, true, `${scenario.id}: handoff must build`);
    assert.match(handoff.text, /БЫСТРАЯ КОНСУЛЬТАЦИЯ ЮРИСТА/);
    assert.match(handoff.text, /предварительная маршрутизация, а не юридическое заключение/i);
    const transfer = consultationToWizardDraft(scenario.input);
    assert.ok(transfer.draft, `${scenario.id}: wizard draft`);
    for (const forbidden of fixture.forbidden_wizard_keys) {
      assert.equal(Object.hasOwn(transfer.draft, forbidden), false, `${scenario.id}: forbidden wizard key ${forbidden}`);
    }
  }
}

const matcap = consultationRouting(fixture.cases.find((item) => item.id === 'matcap_without_mortgage').input);
assert.equal(matcap.broker_needed, false, 'matcap without mortgage must not route to broker');
const certificate = consultationRouting(fixture.cases.find((item) => item.id === 'certificate_without_mortgage').input);
assert.equal(certificate.broker_needed, false, 'certificate without mortgage must not route to broker');
const combined = consultationRouting(fixture.cases.find((item) => item.id === 'mortgage_and_matcap').input);
assert.equal(combined.broker_needed, true, 'combined mortgage case needs broker for mortgage scope');
assert.match(combined.legal_scope, /СПН и юрист/);

console.log(`Navigator v2 consultation intake semantic regression passed: ${fixture.cases.length} synthetic cases`);
