import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  adaptLegacyWizardDraft,
  buildIntakeAssessment,
  buildLegalPassport,
  normalizeFact,
  validateIntakeCatalog
} from '../assets/js/nav-v2/spn-intake-contract-v1.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../config/nav-v2-intake-contract-v1.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/nav-v2-intake-contract-v1.json', import.meta.url), 'utf8'));

function mergeDraft(base, patch) {
  return {
    ...base,
    ...patch,
    facts: { ...(base.facts || {}), ...(patch.facts || {}) },
    documents: patch.documents === undefined ? [...(base.documents || [])] : [...patch.documents]
  };
}

const baseDraft = {
  requestType: 'prepare_deposit',
  representation: 'seller',
  stage: 'urgent_deposit',
  objectType: 'flat_mkd',
  objectAddress: 'Квартира, центральная часть города',
  objectNotSelectedReason: '',
  cadastralNumberKnown: 'unknown',
  urgency: 'normal',
  targetDate: '2026-07-20',
  dateUnknown: false,
  leadSpnConfirmed: true,
  nextAction: 'Запросить ключевые документы и согласовать время консультации.',
  requestedDecision: '',
  lawyerRequestType: '',
  lawyerQuestion: '',
  depositRequired: true,
  depositAmountKnown: false,
  depositConditionsKnown: false,
  documentsReviewed: true,
  lawyerRequestConfirmed: true,
  documents: [
    { type: 'title_basis', title: 'Основание права', side: 'seller', status: 'requested' }
  ],
  facts: {
    encumbrance: { value: 'no', source: 'document' },
    settlements_agreed: { value: 'yes', source: 'client' },
    expenses_agreed: { value: 'yes', source: 'client' }
  }
};

const validation = validateIntakeCatalog(catalog);
assert.deepEqual(validation, { valid: true, errors: [] });
assert.equal(catalog.steps.length, 3);
assert.deepEqual(catalog.steps.map((step) => step.id), ['situation', 'facts', 'review']);
assert.deepEqual(catalog.tri_state_values, ['yes', 'no', 'unknown', 'not_applicable']);

for (const scenario of fixture.scenarios) {
  const draft = mergeDraft(baseDraft, scenario.patch || {});
  const assessment = buildIntakeAssessment(draft, catalog);
  const expect = scenario.expect || {};
  const ruleIds = assessment.passport.risk_flags.map((rule) => rule.id);

  if ('lawyer' in expect) assert.equal(assessment.passport.specialists.lawyer, expect.lawyer, `${scenario.id}: lawyer`);
  if ('broker' in expect) assert.equal(assessment.passport.specialists.broker, expect.broker, `${scenario.id}: broker`);
  if ('save_draft' in expect) assert.equal(assessment.gates.save_draft.allowed, expect.save_draft, `${scenario.id}: save_draft`);
  if ('form_card' in expect) assert.equal(assessment.gates.form_card.allowed, expect.form_card, `${scenario.id}: form_card`);
  if ('handoff' in expect) assert.equal(assessment.gates.handoff_lawyer.state, expect.handoff, `${scenario.id}: handoff`);
  if ('handoff_allowed' in expect) assert.equal(assessment.gates.handoff_lawyer.allowed, expect.handoff_allowed, `${scenario.id}: handoff_allowed`);
  for (const rule of expect.rules || []) assert.equal(ruleIds.includes(rule), true, `${scenario.id}: missing rule ${rule}`);
}

const matcapOnly = buildIntakeAssessment(mergeDraft(baseDraft, {
  representation: 'buyer',
  facts: {
    mortgage: { value: 'no', source: 'client' },
    military_mortgage: { value: 'no', source: 'client' },
    matcap: { value: 'yes', source: 'document' }
  }
}), catalog);
assert.equal(matcapOnly.passport.specialists.broker, false);
assert.equal(matcapOnly.passport.specialists.broker_scope, 'not_required');
assert.equal(matcapOnly.passport.specialists.lawyer, true);

const sources = buildLegalPassport(mergeDraft(baseDraft, {
  facts: {
    encumbrance: { value: 'no', source: 'document' },
    power_of_attorney: { value: 'yes', source: 'client' },
    inheritance: { value: 'unknown', source: 'unchecked' },
    privatisation: { value: 'not_applicable', source: 'unchecked' }
  }
}), catalog);
assert.equal(sources.confirmed_facts.some((fact) => fact.id === 'encumbrance'), true);
assert.equal(sources.client_reported_facts.some((fact) => fact.id === 'power_of_attorney'), true);
assert.equal(sources.unknown_facts.some((fact) => fact.id === 'inheritance'), true);
assert.equal(sources.unknown_facts.some((fact) => fact.id === 'privatisation'), false);
assert.deepEqual(normalizeFact({ value: 'garbage', source: 'garbage' }), { value: 'unknown', source: 'unchecked' });

const legacy = adaptLegacyWizardDraft({
  preparationMode: 'deposit',
  representation: 'buyer',
  stage: 'urgent_deposit',
  objectType: 'flat_mkd',
  address: 'внутренний ориентир',
  payments: ['matcap'],
  flags: ['minorBuyer'],
  clientNextStep: 'Передать юристу',
  lawyerQuestion: 'Можно ли готовить задаток?'
});
const legacyAssessment = buildIntakeAssessment({
  ...legacy,
  documentsReviewed: true,
  requestedDecision: 'Определить возможность задатка.',
  lawyerRequestType: 'check_deposit_possible'
}, catalog);
assert.equal(legacyAssessment.passport.version, 1);
assert.equal(legacyAssessment.passport.specialists.lawyer, true);
assert.equal(legacyAssessment.passport.specialists.broker, false);
assert.equal(legacyAssessment.passport.object.address, 'внутренний ориентир');

const hiddenTerms = buildIntakeAssessment(mergeDraft(baseDraft, {
  requestType: 'capture_situation',
  facts: {
    settlements_agreed: { value: 'unknown', source: 'unchecked' },
    expenses_agreed: { value: 'unknown', source: 'unchecked' }
  }
}), catalog);
assert.equal(hiddenTerms.passport.risk_flags.some((rule) => rule.id === 'settlements_not_agreed'), false);
assert.equal(hiddenTerms.passport.risk_flags.some((rule) => rule.id === 'expenses_not_agreed'), false);

const missingUrgency = buildIntakeAssessment(mergeDraft(baseDraft, {
  urgency: '',
  targetDate: '',
  dateUnknown: true,
  facts: { minor_seller: { value: 'yes', source: 'client' } }
}), catalog);
assert.equal(missingUrgency.gates.handoff_lawyer.missing.some((item) => item.id === 'urgency'), true);

const unconfirmedRequest = buildIntakeAssessment(mergeDraft(baseDraft, {
  lawyerRequestConfirmed: false,
  facts: { minor_seller: { value: 'yes', source: 'client' } }
}), catalog);
assert.equal(unconfirmedRequest.gates.handoff_lawyer.missing.some((item) => item.id === 'lawyer_request_confirmation'), true);

const missingRequiredDocuments = buildIntakeAssessment(mergeDraft(baseDraft, {
  documents: [],
  facts: { power_of_attorney: { value: 'yes', source: 'client' } }
}), catalog);
assert.equal(missingRequiredDocuments.gates.handoff_lawyer.missing.some((item) => item.id === 'documents'), true);

const serialized = JSON.stringify(legacyAssessment.passport);
for (const forbiddenKey of ['seller_phone', 'buyer_phone', 'passport_number', 'bank_card', 'snils']) {
  assert.equal(serialized.includes(forbiddenKey), false, `passport must not contain ${forbiddenKey}`);
}

assert.equal(fixture.scenarios.length >= 18, true);
console.log(`Navigator v2 intake contract v1 passed: ${fixture.scenarios.length} business fixtures, tri-state facts, evidence sources, legal passport, gates, legacy adapter and mortgage-only broker scope`);
