import assert from 'node:assert/strict';
import {
  buildExactDuplicateOwnerDecisionPackage,
  createExactDuplicateDecisionState,
  summarizeExactDuplicateOwnerDecision,
  updateExactDuplicateDecisionState,
  validateExactDuplicateReviewReport
} from '../assets/js/nav-v2/operational-duplicate-review-model-v2.js';

function deal(id, createdAt, overrides = {}) {
  return {
    deal_id: id,
    deal_title: `Сделка ${id}`,
    address: 'Тестовый адрес',
    status: 'draft',
    risk_level: 'yellow',
    readiness_deposit: 80,
    readiness_deal: 50,
    created_at: createdAt,
    updated_at: createdAt,
    latest_activity_at: createdAt,
    next_action: 'Проверить карточку',
    counts: { tasks: 2, risks: 1, documents: 8, events: 2, comments: 0, reviews: 0, participants: 1, expenses: 2 },
    latest: {},
    semantic_hashes: { deal: 'a', tasks: 'b', risks: 'c', documents: 'd', events: 'e', comments: 'f', reviews: 'f', participants: 'g', expenses: 'h' },
    card_url: `./deal-card-v2.html?id=${id}`,
    ...overrides
  };
}

function group(key, firstId, secondId, overrides = {}) {
  return {
    group_key: key,
    created_by: 'owner-1',
    created_by_name: 'Алексей Ковтун',
    deal_count: 2,
    first_created_at: '2026-07-14T09:00:00.000Z',
    last_created_at: '2026-07-14T09:00:06.000Z',
    interval_seconds: 6,
    suggested_canonical_deal_id: firstId,
    suggestion_basis: 'earliest_created_only',
    suggestion_confidence: 'medium',
    all_semantic_equal: true,
    has_post_creation_divergence: false,
    entity_comparison: { deal: true, tasks: true, risks: true, documents: true, events: true, comments: true, reviews: true, participants: true, expenses: true },
    comments_and_reviews: 0,
    manual_review_reasons: ['Текущие карточки совпадают.', 'Раннейшая карточка — только предложение.'],
    deals: [deal(firstId, '2026-07-14T09:00:00.000Z'), deal(secondId, '2026-07-14T09:00:06.000Z')],
    selection_available: false,
    mutation_available: false,
    owner_decision_required: true,
    ...overrides
  };
}

function report(role = 'owner') {
  const items = [
    group('group-1', 'deal-1', 'deal-2'),
    group('group-2', 'deal-3', 'deal-4', {
      all_semantic_equal: false,
      has_post_creation_divergence: true,
      suggestion_confidence: 'low',
      entity_comparison: { deal: true, tasks: false, risks: true, documents: true, events: true, comments: true, reviews: true, participants: true, expenses: true },
      manual_review_reasons: ['Различаются задачи.', 'Нужен перенос уникальных данных.']
    })
  ];
  return {
    report_version: 8,
    profile: { id: `${role}-1`, role, full_name: role === 'manager' ? 'Менеджер' : 'Владелец', email: `${role}@example.test` },
    exact_duplicate_review_pack: {
      review_version: 1,
      generated_at: '2026-07-14T12:00:00.000Z',
      summary: {
        groups: 2,
        deals: 4,
        exact_semantic_groups: 1,
        diverged_groups: 1,
        groups_with_comments_or_reviews: 0,
        selection_available: false,
        mutation_available: false,
        cleanup_execution_available: false,
        owner_decision_required: true
      },
      items
    }
  };
}

const validation = validateExactDuplicateReviewReport(report());
assert.equal(validation.valid, true);
assert.equal(validation.actor_can_decide, true);
assert.equal(validation.groups.length, 2);

let state = createExactDuplicateDecisionState(validation);
state = updateExactDuplicateDecisionState(state, 'group-1', {
  decision_status: 'confirmed',
  canonical_deal_id: 'deal-1',
  resolution: 'archive_duplicate',
  transfer_note: 'Карточки полностью совпадают, перенос уникальных данных не требуется.',
  decision_reason: 'Ранняя карточка выбрана после сравнения всех дочерних сущностей.'
});
state = updateExactDuplicateDecisionState(state, 'group-2', {
  decision_status: 'confirmed',
  canonical_deal_id: 'deal-3',
  resolution: 'merge_then_archive',
  transfer_note: 'Перенести уникальную задачу из второй карточки перед архивированием.',
  decision_reason: 'В первой карточке сохранён исходный контур, во второй есть уникальная задача.'
});

const summary = summarizeExactDuplicateOwnerDecision(validation, state, report().profile);
assert.equal(summary.decision_package_ready, true);
assert.equal(summary.confirmed, 2);
assert.equal(summary.cleanup_candidate_groups, 2);
assert.equal(summary.cleanup_authorized, false);

const payload = buildExactDuplicateOwnerDecisionPackage(validation, state, report().profile, {
  generatedAt: '2026-07-14T12:10:00.000Z',
  reviewGeneratedAt: '2026-07-14T12:00:00.000Z'
});
assert.equal(payload.summary.decision_package_ready, true);
assert.equal(payload.summary.cleanup_authorized, false);
assert.equal(payload.safety.server_mutation_available, false);
assert.equal(payload.safety.automatic_canonical_selection_available, false);
assert.equal(payload.safety.requires_one_group_at_a_time, true);

const managerValidation = validateExactDuplicateReviewReport(report('manager'));
const managerSummary = summarizeExactDuplicateOwnerDecision(managerValidation, createExactDuplicateDecisionState(managerValidation), report('manager').profile);
assert.equal(managerValidation.valid, true);
assert.equal(managerValidation.actor_can_decide, false);
assert.equal(managerSummary.decision_package_ready, false);

const invalidCanonical = updateExactDuplicateDecisionState(state, 'group-1', { canonical_deal_id: 'deal-other' });
const invalidCanonicalSummary = summarizeExactDuplicateOwnerDecision(validation, invalidCanonical, report().profile);
assert.equal(invalidCanonicalSummary.decision_package_ready, false);
assert.match(invalidCanonicalSummary.decision_rows[0].errors.join(' '), /каноническую/i);

const missingTransfer = updateExactDuplicateDecisionState(state, 'group-2', { transfer_note: '' });
const missingTransferSummary = summarizeExactDuplicateOwnerDecision(validation, missingTransfer, report().profile);
assert.equal(missingTransferSummary.decision_package_ready, false);
assert.match(missingTransferSummary.decision_rows[1].errors.join(' '), /переноса/i);

let needsReviewState = createExactDuplicateDecisionState(validation);
for (const key of ['group-1', 'group-2']) {
  needsReviewState = updateExactDuplicateDecisionState(needsReviewState, key, {
    decision_status: 'needs_review',
    resolution: 'needs_manual_review',
    decision_reason: 'Нужно дополнительное подтверждение владельца и сотрудников по карточке.'
  });
}
const needsReviewSummary = summarizeExactDuplicateOwnerDecision(validation, needsReviewState, report().profile);
assert.equal(needsReviewSummary.decision_package_ready, true);
assert.equal(needsReviewSummary.needs_review, 2);
assert.equal(needsReviewSummary.cleanup_candidate_groups, 0);

const tamperedReport = report();
tamperedReport.exact_duplicate_review_pack.summary.mutation_available = true;
const tamperedValidation = validateExactDuplicateReviewReport(tamperedReport);
assert.equal(tamperedValidation.valid, false);
assert.match(tamperedValidation.errors.join(' '), /mutation_available/);

const duplicateGroupReport = report();
duplicateGroupReport.exact_duplicate_review_pack.items[1].group_key = 'group-1';
const duplicateGroupValidation = validateExactDuplicateReviewReport(duplicateGroupReport);
assert.equal(duplicateGroupValidation.valid, false);
assert.match(duplicateGroupValidation.errors.join(' '), /повторяющиеся group_key/i);

const duplicateDealReport = report();
duplicateDealReport.exact_duplicate_review_pack.items[1].deals[0].deal_id = 'deal-1';
const duplicateDealValidation = validateExactDuplicateReviewReport(duplicateDealReport);
assert.equal(duplicateDealValidation.valid, false);
assert.match(duplicateDealValidation.errors.join(' '), /нескольких группах/i);

console.log('Navigator v2 exact duplicate review semantic regression passed');
