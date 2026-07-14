const VALID_STATUSES = new Set(['pending', 'confirmed', 'rejected']);
const DECISION_NOTE_MIN_LENGTH = 10;

function text(value) {
  return String(value ?? '').trim();
}

function status(value) {
  const normalized = text(value).toLowerCase();
  return VALID_STATUSES.has(normalized) ? normalized : 'pending';
}

function dealId(item) {
  return text(item?.deal_id);
}

function lane(item) {
  return text(item?.lane);
}

function sourceRows(items) {
  return Array.isArray(items)
    ? items.filter((item) => dealId(item) && lane(item))
    : [];
}

function decisionRow(item, state) {
  const id = dealId(item);
  const current = state?.[id] || {};
  return {
    deal_id: id,
    lane: lane(item),
    decision_status: status(current.decision_status),
    note: text(current.note)
  };
}

function authorAllowed(profile) {
  return ['owner', 'admin'].includes(text(profile?.role));
}

export function createPilotDecisionState(items) {
  return sourceRows(items).reduce((state, item) => {
    const id = dealId(item);
    state[id] = {
      deal_id: id,
      lane: lane(item),
      decision_status: 'pending',
      note: ''
    };
    return state;
  }, {});
}

export function reconcilePilotDecisionState(items, currentState = {}) {
  return sourceRows(items).reduce((state, item) => {
    const id = dealId(item);
    const current = currentState?.[id];
    state[id] = current && text(current.lane) === lane(item)
      ? decisionRow(item, currentState)
      : {
          deal_id: id,
          lane: lane(item),
          decision_status: 'pending',
          note: ''
        };
    return state;
  }, {});
}

export function updatePilotDecision(state, targetDealId, patch = {}) {
  const id = text(targetDealId);
  if (!id || !state?.[id]) return state || {};
  return {
    ...state,
    [id]: {
      ...state[id],
      decision_status: patch.decision_status === undefined
        ? status(state[id].decision_status)
        : status(patch.decision_status),
      note: patch.note === undefined ? text(state[id].note) : text(patch.note)
    }
  };
}

export function summarizePilotDecisions(items, state, profile = {}) {
  const rows = sourceRows(items).map((item) => decisionRow(item, state));
  const confirmed = rows.filter((row) => row.decision_status === 'confirmed').length;
  const rejected = rows.filter((row) => row.decision_status === 'rejected').length;
  const pending = rows.filter((row) => row.decision_status === 'pending').length;
  const invalidNotes = rows.filter((row) => row.decision_status !== 'pending' && row.note.length < DECISION_NOTE_MIN_LENGTH).length;
  const allowed = authorAllowed(profile);
  const reviewComplete = rows.length > 0 && pending === 0 && invalidNotes === 0;

  return {
    total: rows.length,
    reviewed: confirmed + rejected,
    confirmed,
    rejected,
    pending,
    invalid_notes: invalidNotes,
    note_min_length: DECISION_NOTE_MIN_LENGTH,
    author_allowed: allowed,
    review_complete: reviewComplete,
    decision_package_ready: allowed && reviewComplete
  };
}

function shortlistSnapshot(item) {
  return {
    review_order: Number(item?.review_order || 0),
    lane: lane(item),
    lane_label: text(item?.lane_label) || null,
    deal_id: dealId(item),
    deal_title: text(item?.deal_title) || null,
    address: text(item?.address) || null,
    deal_status: text(item?.deal_status) || null,
    readiness_deposit: Number(item?.readiness_deposit || 0),
    readiness_deal: Number(item?.readiness_deal || 0),
    manager_id: item?.manager_id || null,
    manager_name: text(item?.manager_name) || null,
    seller_spn_id: item?.seller_spn_id || null,
    seller_spn_name: text(item?.seller_spn_name) || null,
    buyer_spn_id: item?.buyer_spn_id || null,
    buyer_spn_name: text(item?.buyer_spn_name) || null,
    evidence_candidate_id: item?.evidence_candidate_id || null,
    evidence_candidate_name: text(item?.evidence_candidate_name) || null,
    open_tasks: Number(item?.open_tasks || 0),
    overdue_tasks: Number(item?.overdue_tasks || 0),
    open_risks: Number(item?.open_risks || 0),
    blocking_deal_risks: Number(item?.blocking_deal_risks || 0),
    open_required_documents: Number(item?.open_required_documents || 0),
    overdue_required_documents: Number(item?.overdue_required_documents || 0),
    resolved_documents: Number(item?.resolved_documents || 0),
    unowned_required_documents: Number(item?.unowned_required_documents || 0),
    reasons: Array.isArray(item?.reasons) ? item.reasons.map(text).filter(Boolean) : [],
    cautions: Array.isArray(item?.cautions) ? item.cautions.map(text).filter(Boolean) : [],
    safe_action: text(item?.safe_action) || null
  };
}

function shortlistKey(items) {
  return sourceRows(items)
    .map((item) => `${Number(item?.review_order || 0)}:${lane(item)}:${dealId(item)}`)
    .sort()
    .join('|');
}

export function buildPilotDecisionPackage(report, state, options = {}) {
  const items = sourceRows(report?.operational_pilot_shortlist?.items);
  const profile = report?.profile || {};
  const summary = summarizePilotDecisions(items, state, profile);
  const decisions = items.map((item) => {
    const decision = decisionRow(item, state);
    return {
      ...decision,
      selected_for_pilot: decision.decision_status === 'confirmed',
      note_valid: decision.decision_status === 'pending' || decision.note.length >= DECISION_NOTE_MIN_LENGTH
    };
  });

  return {
    export_type: 'navigator_v2_operational_pilot_owner_decision',
    schema_version: 1,
    exported_at: options.exportedAt || new Date().toISOString(),
    source: {
      report_version: report?.report_version || null,
      pilot_version: report?.operational_pilot_shortlist?.pilot_version || null,
      report_generated_at: report?.generated_at || null,
      period_days: Number(report?.period_days || 0),
      shortlist_key: shortlistKey(items)
    },
    decision_author: {
      id: profile?.id || null,
      full_name: text(profile?.full_name) || null,
      email: text(profile?.email) || null,
      role: text(profile?.role) || null,
      role_allowed: authorAllowed(profile)
    },
    summary,
    decisions,
    shortlist_snapshot: items.map(shortlistSnapshot),
    safety: {
      browser_local_only: true,
      server_mutation_available: false,
      automatic_selection_available: false,
      pilot_started: false,
      pilot_start_authorized: false,
      requires_manual_pilot_start: true,
      requires_fresh_readonly_revalidation: true,
      requires_separate_measurement_baseline: true
    }
  };
}
