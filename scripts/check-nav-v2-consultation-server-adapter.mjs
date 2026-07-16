import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  consultationClientRequestId,
  consultationConversionToWizardDraft,
  consultationDecisionPresentation,
  consultationDecisionRpcPreview,
  consultationServerPayloadPreview,
  minimizeConsultationDetailResponse,
  minimizeConsultationQueueResponse
} from '../assets/js/nav-v2/consultation-server-adapter-v2.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'fixtures/nav-v2-consultation-server-adapter-scenarios.json'),
  'utf8'
));

assert.equal(fixture.schema_version, 2);
assert.equal(fixture.synthetic_only, true);

for (const scenario of fixture.payload_cases) {
  const result = consultationServerPayloadPreview(scenario.input, {
    client_request_id: scenario.input.client_request_id
  });
  assert.equal(result.server_ready, true, `${scenario.id}: payload must be server-ready`);
  assert.ok(result.payload, `${scenario.id}: payload is required`);
  assert.equal(result.rpc_preview.name, 'nav_v2_create_consultation');
  assert.deepEqual(result.rpc_preview.args, { p_payload: result.payload });
  assert.equal(result.payload.client_request_id, scenario.input.client_request_id.toLowerCase());
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
  assert.equal(result.persistence.idempotency_key_present, true, `${scenario.id}: idempotency key missing`);
}

const stableInput = fixture.payload_cases[0].input;
const firstPreview = consultationServerPayloadPreview(stableInput);
const repeatPreview = consultationServerPayloadPreview(stableInput);
assert.deepEqual(firstPreview.payload, repeatPreview.payload, 'same client request ID must create the same payload');

for (const scenario of fixture.idempotency_cases) {
  const normalized = consultationClientRequestId(scenario.value);
  assert.equal(Boolean(normalized), scenario.valid, `${scenario.id}: UUID validity mismatch`);
  if (scenario.normalized) assert.equal(normalized, scenario.normalized);
}
const missingId = consultationServerPayloadPreview({ ...stableInput, client_request_id: '' });
assert.equal(missingId.server_ready, false);
assert.ok(missingId.errors.some((message) => message.includes('client_request_id')));
const malformedId = consultationServerPayloadPreview({ ...stableInput, client_request_id: 'bad-id' });
assert.equal(malformedId.server_ready, false);
assert.equal(malformedId.rpc_preview, null);

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
assert.equal(detail.conversion_draft.creates_deal, false);
assert.equal(detail.conversion_draft.creates_backlog, false);
assert.equal(detail.messages[0].author_email, undefined);
assert.equal(detail.messages[0].body, 'Нужна полная подготовка к задатку.');

for (const scenario of fixture.decision_cases) {
  const result = consultationDecisionRpcPreview(scenario.input);
  assert.equal(result.ok, scenario.valid, `${scenario.id}: decision validity mismatch`);
  assert.equal(result.transport_enabled, false);
  if (!scenario.valid) {
    assert.equal(result.rpc_preview, null);
    continue;
  }
  assert.equal(result.rpc_preview.name, 'nav_v2_decide_consultation');
  assert.deepEqual(result.rpc_preview.args, {
    p_consultation_id: scenario.input.consultation_id,
    p_decision: scenario.input.decision,
    p_body: scenario.input.body,
    p_conversion_mode: scenario.input.conversion_mode
  });
  assert.equal(result.presentation.next_status, scenario.next_status);
  assert.equal(
    result.presentation.requires_conversion_mode,
    scenario.input.decision === 'convert_to_preparation'
  );
}

const answerPresentation = consultationDecisionPresentation('answer');
assert.equal(answerPresentation.requires_conversion_mode, false);
const conversionPresentation = consultationDecisionPresentation('convert_to_preparation');
assert.deepEqual(conversionPresentation.conversion_modes, ['deposit', 'deal']);
assert.equal(consultationDecisionPresentation('bad'), null);

for (const scenario of fixture.conversion_cases) {
  const wizard = consultationConversionToWizardDraft(scenario.input);
  if (scenario.expected === null) {
    assert.equal(wizard, null, `${scenario.id}: unsafe conversion must be rejected`);
    continue;
  }
  for (const [key, expected] of Object.entries(scenario.expected)) {
    assert.deepEqual(wizard[key], expected, `${scenario.id}: ${key} mismatch`);
  }
  assert.equal(wizard.consultationId, scenario.input.consultation_id);
  assert.equal(Object.prototype.hasOwnProperty.call(wizard, 'client_name'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(wizard, 'documents_url'), false);
}

console.log('Navigator v2 consultation server adapter regression passed: idempotent create preview, exact four-argument decisions, DTO minimization and safe conversion');
