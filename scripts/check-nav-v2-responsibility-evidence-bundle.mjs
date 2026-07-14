import assert from 'node:assert/strict';
import {
  extractConfirmationOperations,
  sha256Hex,
  stableStringify,
  validateEvidenceBundle
} from '../assets/js/nav-v2/manager-source-remediation-evidence-bundle-v2.js';

const NOW = Date.parse('2026-07-14T08:00:00.000Z');
const OWNER_ID = 'c354bc61-7427-4d8d-8b2c-70023cd87198';
const SPN_ID = '98ee4523-dacb-47c3-b458-97e524f92444';
const NOTE = 'Менеджер подтверждён владельцем офиса';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function operation(proposedId = OWNER_ID) {
  return {
    type: 'profile_manager',
    target_id: SPN_ID,
    field: 'manager_id',
    expected_current_id: null,
    proposed_id: proposedId,
    note: NOTE
  };
}

function confirmation() {
  return {
    schema_version: 1,
    export_type: 'navigator_v2_responsibility_confirmation_draft',
    exported_at: '2026-07-14T07:50:00.000Z',
    source: {
      report_version: 6,
      report_generated_at: '2026-07-14T07:49:00.000Z',
      context_version: 1,
      draft_updated_at: '2026-07-14T07:49:30.000Z'
    },
    safety: {
      local_storage_only: true,
      server_selection_available: false,
      server_mutation_available: false,
      requires_separate_audited_point_operation: true
    },
    summary: {
      deal_decisions: 0,
      manager_decisions: 1,
      confirmed_deals: 0,
      confirmed_managers: 1
    },
    deal_decisions: [],
    manager_decisions: [{
      spn_id: SPN_ID,
      spn_name: 'Овчинников Александр Константинович',
      spn_email: 'a.k.ovchinnikov@borisoglebsk.etagi.com',
      decision_status: 'confirmed',
      decision_status_label: 'Подтверждено',
      current_manager_id: null,
      current_manager_name: null,
      proposed_manager_id: OWNER_ID,
      proposed_manager_name: 'Алексей Ковтун',
      proposed_manager_role: 'owner',
      note: NOTE
    }]
  };
}

function validationReport(sourcePackage) {
  return {
    export_type: 'navigator_v2_responsibility_confirmation_validation',
    schema_version: 1,
    validated_by_user_id: OWNER_ID,
    safety: {
      read_only_validation: true,
      server_mutation_available: false,
      requires_separate_audited_point_operation: true
    },
    package: clone(sourcePackage),
    validation: {
      validation_version: 1,
      validated_at: '2026-07-14T07:54:00.000Z',
      source_report_version: 6,
      source_report_generated_at: '2026-07-14T07:53:00.000Z',
      package_exported_at: sourcePackage.exported_at,
      package_schema_version: 1,
      top_errors: [],
      summary: {
        records: 1,
        operations: 1,
        ready: 1,
        stale: 0,
        invalid: 0,
        not_ready: 0,
        no_change: 0
      },
      point_operation_ready: true,
      operations: [{
        ...operation(),
        record_index: 0,
        target_title: 'Овчинников Александр Константинович',
        proposed_name: 'Алексей Ковтун',
        state: 'ready',
        reasons: []
      }]
    }
  };
}

function serverPreview() {
  return {
    export_type: 'navigator_v2_responsibility_point_server_preview',
    schema_version: 1,
    generated_by_user_id: OWNER_ID,
    operation: operation(),
    preview: {
      preview_version: 1,
      generated_at: '2026-07-14T07:56:00.000Z',
      expires_at: '2026-07-14T08:11:00.000Z',
      ready: true,
      reason_code: 'ready',
      reason: 'Операция прошла серверную read-only проверку.',
      operation_type: 'profile_manager',
      target_id: SPN_ID,
      field: 'manager_id',
      expected_current_id: null,
      actual_current_id: null,
      proposed_id: OWNER_ID,
      note: NOTE,
      operation_fingerprint: 'fa74d0d5615b044aeee4540e39df1be1',
      mutation_available: false,
      execution_rpc_available: false,
      requires_revalidation: true
    },
    safety: {
      read_only_preview: true,
      mutation_available: false,
      execution_rpc_available: false,
      requires_revalidation: true
    }
  };
}

function validBundle() {
  const source = confirmation();
  return {
    confirmation: source,
    validation: validationReport(source),
    preview: serverPreview()
  };
}

{
  const extracted = extractConfirmationOperations(confirmation());
  assert.equal(extracted.errors.length, 0);
  assert.equal(extracted.operations.length, 1);
  assert.deepEqual(
    {
      type: extracted.operations[0].type,
      target_id: extracted.operations[0].target_id,
      field: extracted.operations[0].field,
      expected_current_id: extracted.operations[0].expected_current_id,
      proposed_id: extracted.operations[0].proposed_id,
      note: extracted.operations[0].note
    },
    operation()
  );
}

{
  const result = validateEvidenceBundle(validBundle(), NOW);
  assert.equal(result.bundle_ready, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.operation_fingerprint, 'fa74d0d5615b044aeee4540e39df1be1');
  assert.equal(result.preview_remaining_seconds, 660);
}

{
  const bundle = validBundle();
  bundle.validation.package.manager_decisions[0].note = 'Изменено после проверки';
  const result = validateEvidenceBundle(bundle, NOW);
  assert.equal(result.bundle_ready, false);
  assert.ok(result.errors.some((error) => error.includes('другому confirmation JSON')));
}

{
  const bundle = validBundle();
  bundle.preview.preview.expires_at = '2026-07-14T07:59:59.000Z';
  const result = validateEvidenceBundle(bundle, NOW);
  assert.equal(result.bundle_ready, false);
  assert.ok(result.errors.some((error) => error.includes('истёк')));
}

{
  const bundle = validBundle();
  bundle.preview.operation.proposed_id = '11111111-1111-4111-8111-111111111111';
  const result = validateEvidenceBundle(bundle, NOW);
  assert.equal(result.bundle_ready, false);
  assert.ok(result.errors.some((error) => error.includes('server preview envelope')));
}

{
  const bundle = validBundle();
  bundle.confirmation.deal_decisions.push({
    deal_id: '22222222-2222-4222-8222-222222222222',
    decision_status: 'confirmed',
    current_seller_spn_id: null,
    proposed_seller_spn_id: SPN_ID,
    current_buyer_spn_id: null,
    proposed_buyer_spn_id: null,
    note: 'Подтверждён СПН продавца по карточке сделки'
  });
  bundle.validation.package = clone(bundle.confirmation);
  const result = validateEvidenceBundle(bundle, NOW);
  assert.equal(result.bundle_ready, false);
  assert.ok(result.errors.some((error) => error.includes('ровно одну изменяемую операцию')));
}

{
  const bundle = validBundle();
  bundle.preview.generated_by_user_id = '33333333-3333-4333-8333-333333333333';
  const result = validateEvidenceBundle(bundle, NOW);
  assert.equal(result.bundle_ready, false);
  assert.ok(result.errors.some((error) => error.includes('разными пользователями')));
}

{
  assert.equal(stableStringify({ b: 2, a: { d: 4, c: 3 } }), stableStringify({ a: { c: 3, d: 4 }, b: 2 }));
  assert.equal(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
}

console.log('Navigator v2 responsibility evidence bundle validation passed: valid, tampered, expired, mismatched and multi-operation cases covered');
