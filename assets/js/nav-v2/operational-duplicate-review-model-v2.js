const TEXT_MIN_LENGTH = 10;
const ALLOWED_VIEW_ROLES = new Set(['owner', 'admin', 'manager']);
const ALLOWED_DECISION_ROLES = new Set(['owner', 'admin']);
const DECISION_STATUSES = new Set(['confirmed', 'needs_review']);
const RESOLUTIONS = new Set([
  'keep_both',
  'merge_then_archive',
  'archive_duplicate',
  'cancel_duplicate',
  'needs_manual_review'
]);

function text(value) {
  return String(value ?? '').trim();
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(value) {
  return value === true;
}

function allowedViewRole(value) {
  return ALLOWED_VIEW_ROLES.has(text(value));
}

function allowedDecisionRole(value) {
  return ALLOWED_DECISION_ROLES.has(text(value));
}

function normalizedDeal(value = {}) {
  const source = object(value) || {};
  return {
    deal_id: text(source.deal_id),
    deal_title: text(source.deal_title) || null,
    address: text(source.address) || null,
    status: text(source.status) || null,
    risk_level: text(source.risk_level) || null,
    readiness_deposit: number(source.readiness_deposit),
    readiness_deal: number(source.readiness_deal),
    created_at: source.created_at || null,
    updated_at: source.updated_at || null,
    latest_activity_at: source.latest_activity_at || null,
    next_action: text(source.next_action) || null,
    created_by: source.created_by || null,
    created_by_name: text(source.created_by_name) || null,
    manager_id: source.manager_id || null,
    manager_name: text(source.manager_name) || null,
    seller_spn_id: source.seller_spn_id || null,
    seller_spn_name: text(source.seller_spn_name) || null,
    buyer_spn_id: source.buyer_spn_id || null,
    buyer_spn_name: text(source.buyer_spn_name) || null,
    lawyer_id: source.lawyer_id || null,
    lawyer_name: text(source.lawyer_name) || null,
    broker_id: source.broker_id || null,
    broker_name: text(source.broker_name) || null,
    counts: object(source.counts) || {},
    latest: object(source.latest) || {},
    semantic_hashes: object(source.semantic_hashes) || {},
    card_url: text(source.card_url) || null
  };
}

function normalizedGroup(value = {}) {
  const source = object(value) || {};
  return {
    group_key: text(source.group_key),
    created_by: source.created_by || null,
    created_by_name: text(source.created_by_name) || null,
    deal_count: number(source.deal_count),
    first_created_at: source.first_created_at || null,
    last_created_at: source.last_created_at || null,
    interval_seconds: number(source.interval_seconds),
    suggested_canonical_deal_id: text(source.suggested_canonical_deal_id) || null,
    suggestion_basis: text(source.suggestion_basis) || null,
    suggestion_confidence: text(source.suggestion_confidence) || null,
    all_semantic_equal: bool(source.all_semantic_equal),
    has_post_creation_divergence: bool(source.has_post_creation_divergence),
    entity_comparison: object(source.entity_comparison) || {},
    comments_and_reviews: number(source.comments_and_reviews),
    manual_review_reasons: Array.isArray(source.manual_review_reasons)
      ? source.manual_review_reasons.map(text).filter(Boolean)
      : [],
    deals: Array.isArray(source.deals) ? source.deals.map(normalizedDeal) : [],
    selection_available: source.selection_available === true,
    mutation_available: source.mutation_available === true,
    owner_decision_required: source.owner_decision_required === true
  };
}

function reviewPackErrors(pack) {
  const errors = [];
  const root = object(pack);
  if (!root) return ['Отсутствует exact_duplicate_review_pack.'];
  if (Number(root.review_version) !== 1) errors.push('Поддерживается только review_version=1.');
  if (!object(root.summary)) errors.push('Отсутствует summary.');
  if (!Array.isArray(root.items)) errors.push('items должен быть массивом.');
  const summary = object(root.summary) || {};
  if (summary.selection_available !== false) errors.push('selection_available должен быть false.');
  if (summary.mutation_available !== false) errors.push('mutation_available должен быть false.');
  if (summary.cleanup_execution_available !== false) errors.push('cleanup_execution_available должен быть false.');
  if (summary.owner_decision_required !== true) errors.push('owner_decision_required должен быть true.');
  return errors;
}

export function validateExactDuplicateReviewReport(report) {
  const pack = object(report?.exact_duplicate_review_pack);
  const errors = reviewPackErrors(pack);
  const actor = object(report?.profile) || {};
  const groups = Array.isArray(pack?.items) ? pack.items.map(normalizedGroup) : [];
  const groupKeys = groups.map((group) => group.group_key).filter(Boolean);
  const duplicateKeys = groupKeys.filter((key, index) => groupKeys.indexOf(key) !== index);
  const seenDealIds = new Set();

  if (!allowedViewRole(actor.role)) errors.push('Просмотр доступен только owner/admin/manager.');
  if (number(pack?.summary?.groups) !== groups.length) errors.push('summary.groups не совпадает с items.');
  if (!groups.length) errors.push('Пакет не содержит групп дублей.');
  if (duplicateKeys.length) errors.push('В items есть повторяющиеся group_key.');

  groups.forEach((group) => {
    if (!group.group_key) errors.push('Группа не содержит group_key.');
    if (group.deal_count !== group.deals.length) errors.push(`${group.group_key || 'неизвестная группа'}: deal_count не совпадает с deals.`);
    if (group.deals.length < 2) errors.push(`${group.group_key || 'неизвестная группа'}: требуется минимум две карточки.`);
    if (group.selection_available || group.mutation_available || !group.owner_decision_required) {
      errors.push(`${group.group_key || 'неизвестная группа'}: нарушена read-only граница.`);
    }
    const ids = group.deals.map((deal) => deal.deal_id).filter(Boolean);
    if (!ids.includes(group.suggested_canonical_deal_id)) {
      errors.push(`${group.group_key || 'неизвестная группа'}: suggested canonical отсутствует в deals.`);
    }
    ids.forEach((id) => {
      if (seenDealIds.has(id)) errors.push(`Карточка ${id} встречается в нескольких группах.`);
      seenDealIds.add(id);
    });
  });

  return {
    export_type: 'navigator_v2_exact_duplicate_review_validation',
    schema_version: 1,
    validated_at: new Date().toISOString(),
    report_version: report?.report_version || null,
    review_version: pack?.review_version || null,
    actor,
    actor_can_view: allowedViewRole(actor.role),
    actor_can_decide: allowedDecisionRole(actor.role),
    errors,
    valid: errors.length === 0,
    groups,
    summary: object(pack?.summary) || {}
  };
}

export function duplicateResolutionOptions() {
  return [
    { value: 'keep_both', label: 'Оставить обе карточки' },
    { value: 'merge_then_archive', label: 'Перенести уникальные данные и архивировать дубль' },
    { value: 'archive_duplicate', label: 'Архивировать дубль без переноса' },
    { value: 'cancel_duplicate', label: 'Отменить дубль по бизнес-правилу' },
    { value: 'needs_manual_review', label: 'Нужно дополнительное ручное решение' }
  ];
}

export function createExactDuplicateDecisionState(validation) {
  const groups = validation?.valid && Array.isArray(validation.groups) ? validation.groups : [];
  return groups.reduce((state, group) => {
    state[group.group_key] = {
      group_key: group.group_key,
      decision_status: '',
      canonical_deal_id: group.suggested_canonical_deal_id || '',
      resolution: '',
      transfer_note: '',
      decision_reason: ''
    };
    return state;
  }, {});
}

export function updateExactDuplicateDecisionState(state, groupKey, patch = {}) {
  const key = text(groupKey);
  if (!key || !state?.[key]) return state || {};
  const next = { ...state[key] };
  for (const field of ['decision_status', 'canonical_deal_id', 'resolution', 'transfer_note', 'decision_reason']) {
    if (patch[field] !== undefined) next[field] = text(patch[field]);
  }
  return { ...state, [key]: next };
}

function decisionRow(group, state = {}) {
  const current = state?.[group.group_key] || {};
  const decisionStatus = text(current.decision_status);
  const canonicalDealId = text(current.canonical_deal_id) || null;
  const resolution = text(current.resolution);
  const transferNote = text(current.transfer_note);
  const decisionReason = text(current.decision_reason);
  const dealIds = group.deals.map((deal) => deal.deal_id);
  const errors = [];

  if (!DECISION_STATUSES.has(decisionStatus)) errors.push('Нужно выбрать confirmed или needs_review.');
  if (!RESOLUTIONS.has(resolution)) errors.push('Нужно выбрать способ обработки группы.');
  if (decisionReason.length < TEXT_MIN_LENGTH) errors.push(`Основание должно содержать не менее ${TEXT_MIN_LENGTH} символов.`);

  if (decisionStatus === 'confirmed') {
    if (!canonicalDealId || !dealIds.includes(canonicalDealId)) errors.push('Нужно выбрать каноническую карточку из группы.');
    if (resolution === 'needs_manual_review') errors.push('Confirmed-решение не может иметь resolution=needs_manual_review.');
    if ((group.has_post_creation_divergence || resolution === 'merge_then_archive') && transferNote.length < TEXT_MIN_LENGTH) {
      errors.push(`Для переноса или расхождений нужен комментарий не менее ${TEXT_MIN_LENGTH} символов.`);
    }
  }

  if (decisionStatus === 'needs_review' && resolution !== 'needs_manual_review') {
    errors.push('needs_review должен использовать resolution=needs_manual_review.');
  }

  const duplicateDealIds = canonicalDealId ? dealIds.filter((id) => id !== canonicalDealId) : dealIds;
  return {
    group_key: group.group_key,
    decision_status: decisionStatus,
    canonical_deal_id: canonicalDealId,
    duplicate_deal_ids: duplicateDealIds,
    resolution,
    transfer_note: transferNote || null,
    decision_reason: decisionReason,
    valid: errors.length === 0,
    errors
  };
}

export function summarizeExactDuplicateOwnerDecision(validation, state, actor = {}) {
  const groups = validation?.valid && Array.isArray(validation.groups) ? validation.groups : [];
  const decisions = groups.map((group) => decisionRow(group, state));
  const invalid = decisions.filter((decision) => !decision.valid).length;
  const confirmed = decisions.filter((decision) => decision.valid && decision.decision_status === 'confirmed').length;
  const needsReview = decisions.filter((decision) => decision.valid && decision.decision_status === 'needs_review').length;
  const actorCanDecide = allowedDecisionRole(actor?.role);
  const decisionPackageReady = validation?.valid === true
    && actorCanDecide
    && decisions.length > 0
    && invalid === 0;
  return {
    groups: decisions.length,
    confirmed,
    needs_review: needsReview,
    invalid,
    actor_can_decide: actorCanDecide,
    decision_package_ready: decisionPackageReady,
    cleanup_candidate_groups: decisionPackageReady
      ? decisions.filter((decision) => decision.decision_status === 'confirmed' && decision.resolution !== 'keep_both').length
      : 0,
    cleanup_authorized: false,
    decision_rows: decisions
  };
}

export function buildExactDuplicateOwnerDecisionPackage(validation, state, actor = {}, options = {}) {
  const summary = summarizeExactDuplicateOwnerDecision(validation, state, actor);
  const decisionMap = new Map(summary.decision_rows.map((decision) => [decision.group_key, decision]));
  const groups = Array.isArray(validation?.groups) ? validation.groups : [];
  return {
    export_type: 'navigator_v2_exact_duplicate_owner_decision',
    schema_version: 1,
    generated_at: options.generatedAt || new Date().toISOString(),
    source: {
      report_version: validation?.report_version || null,
      review_version: validation?.review_version || null,
      review_generated_at: options.reviewGeneratedAt || null,
      groups: validation?.summary?.groups || groups.length,
      deals: validation?.summary?.deals || groups.reduce((total, group) => total + group.deal_count, 0)
    },
    decision_actor: {
      id: actor?.id || null,
      full_name: text(actor?.full_name) || null,
      email: text(actor?.email) || null,
      role: text(actor?.role) || null,
      role_allowed: allowedDecisionRole(actor?.role)
    },
    summary: {
      groups_reviewed: summary.groups,
      confirmed_groups: summary.confirmed,
      needs_review_groups: summary.needs_review,
      invalid_decisions: summary.invalid,
      cleanup_candidate_groups: summary.cleanup_candidate_groups,
      decision_package_ready: summary.decision_package_ready,
      cleanup_authorized: false,
      server_mutation_performed: false
    },
    decisions: groups.map((group) => {
      const decision = decisionMap.get(group.group_key) || decisionRow(group, state);
      return {
        group_key: group.group_key,
        created_by: group.created_by,
        created_by_name: group.created_by_name,
        first_created_at: group.first_created_at,
        last_created_at: group.last_created_at,
        interval_seconds: group.interval_seconds,
        all_semantic_equal: group.all_semantic_equal,
        has_post_creation_divergence: group.has_post_creation_divergence,
        entity_comparison: group.entity_comparison,
        suggested_canonical_deal_id: group.suggested_canonical_deal_id,
        suggestion_basis: group.suggestion_basis,
        suggestion_confidence: group.suggestion_confidence,
        deal_snapshots: group.deals,
        owner_decision: decision
      };
    }),
    safety: {
      browser_local_only: true,
      server_mutation_available: false,
      automatic_canonical_selection_available: false,
      automatic_merge_available: false,
      automatic_archive_available: false,
      automatic_cancel_available: false,
      cleanup_execution_available: false,
      cleanup_authorized: false,
      earliest_deal_is_only_a_suggestion: true,
      requires_fresh_server_revalidation: true,
      requires_pre_snapshot: true,
      requires_post_snapshot: true,
      requires_audit_event: true,
      requires_one_group_at_a_time: true
    }
  };
}
