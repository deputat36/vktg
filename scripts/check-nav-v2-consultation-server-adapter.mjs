import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  consultationConversionToWizardDraft,
  consultationDecisionPresentation,
  consultationServerPayloadPreview,
  minimizeConsultationDetailResponse,
  minimizeConsultationQueueResponse
} from '../assets/js/nav-v2/consultation-server-adapter-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'fixtures/nav-v2-consultation-server-adapter-scenarios.json'),
  'utf8'
));

for (const scenario of fixture.payload_cases) {
  const result = consultationServerPayloadPreview(scenario.input);
  assert.equal(result.server_ready, true, `${scenario.id}: payload must be server-ready`);
  assert.ok(result.payload, `${scenario.id}: payload is required`);
  for (const [key, expected] of Object.entries(scenario.expected)) {
    if (key === 'question_contains') {
      for (const marker of expected) {
        assert.ok(result.payload.question.includes(marker), `${scenario.id}: question missing ${marker}`);
      }
      continue;
    }
    if (key === 'warning_contains') {
      assert.ok(result.adapter_warnings.some((warning) => warning.includes(expected)), `${scenario.id}: warning missing ${expected}`);
      continue;
    }
    if (key === 'forbidden_payload_keys') {
      for (const forbidden of expected) {
        assert.equal(Object.prototype.hasOwnProperty.call(result.payload, forbidden), false, `${scenario.id}: payload exposes ${forbidden}`);
      }
      continue;
    }
    assert.deepEqual(result.payload[key], expected, `${scenario.id}: ${key} mismatch`);
  }
  assert.equal(result.persistence.deal_created, false, `${scenario.id}: must not create deal`);
  assert.equal(result.persistence.backlog_created, false, `${scenario.id}: must not create backlog`);
  assert.equal(result.persistence.document_url_persisted, false, `${scenario.id}: URL must not persist`);
}

const queue = minimizeConsultationQueueResponse(fixture.queue_case.input);
const queueText = JSON.stringify(queue);
for (const forbidden of fixture.queue_case.forbidden_after_minimization) {
  assert.equal(queueText.includes(`"${forbidden}"`), false, `queue contains forbidden key ${forbidden}`);
}
assert.equal(queue.items.length, 1);
assert.equal(queue.items[0].reference, 'Консультация 00000000');
assert.equal(queue.items[0].actionable_for_lawyer, true);

const detail = minimizeConsultationDetailResponse(fixture.detail_case.input);
assert.equal(detail.profile.email, undefined);
assert.equal(detail.consultation.seller_phone, undefined);
assert.equal(detail.permissions.admin, undefined);
assert.equal(detail.conversion_draft.client_name, undefined);
assert.equal(detail.messages[0].author_email, undefined);
assert.equal(detail.messages[0].body, 'Нужна полная подготовка к задатку.');

for (const scenario of fixture.decision_cases) {
  const result = consultationDecisionPresentation(scenario.decision);
  if (scenario.expected === null) {
    assert.equal(result, null);
    continue;
  }
  assert.equal(result.label, scenario.label);
  assert.equal(result.next_status, scenario.next_status);
}

const wizard = consultationConversionToWizardDraft(fixture.conversion_case.input);
for (const [key, expected] of Object.entries(fixture.conversion_case.expected)) {
  assert.deepEqual(wizard[key], expected, `conversion: ${key} mismatch`);
}
assert.equal(wizard.consultationId, fixture.conversion_case.input.consultation_id);
assert.equal(Object.prototype.hasOwnProperty.call(wizard, 'client_name'), false);
assert.equal(Object.prototype.hasOwnProperty.call(wizard, 'documents_url'), false);

console.log('Navigator v2 consultation server adapter regression passed: payload mapping, URL stripping, DTO minimization, decisions and conversion draft');
