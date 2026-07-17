export const NAV_V2_INTAKE_WORK_PLAN_VERSION = 1;

const DOCUMENT_STATUSES = new Set(['available', 'requested', 'missing', 'problem']);
const SIDE_VALUES = new Set(['seller', 'buyer']);

function text(value) {
  return String(value ?? '').trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function accompaniedSides(draft) {
  const explicit = list(draft?.accompaniedSides).filter((side) => SIDE_VALUES.has(side));
  if (explicit.length) return new Set(explicit);
  if (draft?.representation === 'seller') return new Set(['seller']);
  if (draft?.representation === 'buyer') return new Set(['buyer']);
  if (['one_spn_both', 'both'].includes(draft?.representation)) return new Set(['seller', 'buyer']);
  if (draft?.representation === 'partner_agency') {
    if (draft?.partnerSide === 'both') return new Set(['seller', 'buyer']);
    if (SIDE_VALUES.has(draft?.partnerSide)) return new Set([draft.partnerSide]);
  }
  return new Set();
}

function ownerId(draft, role) {
  const owners = draft?.owners && typeof draft.owners === 'object' ? draft.owners : {};
  const candidates = {
    seller_spn: [owners.seller_spn, owners.sellerSpnId, draft?.sellerSpnId],
    buyer_spn: [owners.buyer_spn, owners.buyerSpnId, draft?.buyerSpnId],
    lead_spn: [owners.lead_spn, owners.leadSpnId, owners.seller_spn, owners.sellerSpnId, owners.buyer_spn, owners.buyerSpnId, draft?.leadSpnId, draft?.sellerSpnId, draft?.buyerSpnId],
    lawyer: [owners.lawyer, owners.lawyerId, draft?.lawyerId],
    broker: [owners.broker, owners.brokerId, draft?.brokerId],
    spn: [owners.spn, owners.lead_spn, owners.leadSpnId, owners.seller_spn, owners.sellerSpnId, owners.buyer_spn, owners.buyerSpnId, draft?.leadSpnId, draft?.sellerSpnId, draft?.buyerSpnId]
  };
  return text((candidates[role] || []).find((value) => text(value)));
}

function documentOwnerRole(side) {
  if (side === 'seller') return 'seller_spn';
  if (side === 'buyer') return 'buyer_spn';
  return 'lead_spn';
}

function approvedLink(record) {
  if (record?.allowed_link_approved !== true) return null;
  try {
    const url = new URL(text(record.allowed_link));
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.toString();
  } catch (_) {
    return null;
  }
}

function deadlineContract(draft, rules) {
  const target = draft?.dateUnknown === true ? '' : text(draft?.targetDate);
  if (target) return { deadline_rule: 'target_date', deadline: target };
  if (rules.some((rule) => rule?.blocks_deposit === true)) return { deadline_rule: 'before_deposit', deadline: null };
  if (rules.some((rule) => rule?.blocks_deal === true)) return { deadline_rule: 'before_deal', deadline: null };
  return { deadline_rule: 'next_review', deadline: null };
}

function requestTitle(catalog, requestType) {
  return text(list(catalog?.lawyer_request_types).find((item) => item?.id === requestType)?.title || requestType);
}

function taskAction(rule, catalog) {
  if (rule?.owner === 'lawyer') return `Рассмотреть запрос: ${requestTitle(catalog, rule.lawyer_request_type) || text(rule.id)}.`;
  if (rule?.owner === 'broker') return text(rule.broker_action);
  if (rule?.owner === 'spn') return text(rule.spn_action);
  return '';
}

function taskEvidence(rule, documentTypes) {
  const titles = unique(list(rule?.documents).map((id) => text(documentTypes.get(id)?.title || id)));
  if (titles.length) return `Безопасные статусы документов: ${titles.join(', ')}.`;
  if (rule?.owner === 'lawyer') return `Структурированное решение юриста по запросу ${text(rule.lawyer_request_type || rule.id)}.`;
  if (rule?.owner === 'broker') return 'Структурированный статус ипотечной части.';
  return 'Структурированный статус согласованности условия.';
}

function taskExpectedResult(rule) {
  if (rule?.owner === 'lawyer') {
    return `${text(rule.expected_decision)} Результат: можно двигаться дальше / нужна информация / нужны документы / стоп-фактор.`.trim();
  }
  if (rule?.owner === 'broker') return 'Ипотечная часть: готова / нужна информация / не готова.';
  if (rule?.owner === 'spn') return 'Условие согласовано либо открытый вопрос зафиксирован с ответственным и сроком.';
  return '';
}

function documentPlan(draft, catalog, matchedRules) {
  const sides = accompaniedSides(draft);
  const definitions = new Map(list(catalog?.document_types).map((item) => [item.id, item]));
  const existing = new Map(list(draft?.documents).map((item) => [item?.type, item]));
  const required = new Map();
  const skipped = new Map();

  for (const rule of matchedRules) {
    for (const type of list(rule?.documents)) {
      const definition = definitions.get(type) || { id: type, title: type, side: 'deal' };
      const side = text(definition.side || 'deal');
      const target = SIDE_VALUES.has(side) && !sides.has(side) ? skipped : required;
      if (!target.has(type)) target.set(type, { definition, rules: [] });
      target.get(type).rules.push(rule);
    }
  }

  const document_candidates = [...required.entries()].map(([type, entry]) => {
    const record = existing.get(type) || {};
    const side = text(entry.definition.side || 'deal');
    const role = documentOwnerRole(side);
    const id = ownerId(draft, role);
    const deadline = deadlineContract(draft, entry.rules);
    return {
      type,
      title: text(entry.definition.title || type),
      side,
      status: DOCUMENT_STATUSES.has(record.status) ? record.status : null,
      owner: { role, id: id || null },
      assignment_state: id ? 'assigned' : 'needs_assignment',
      ...deadline,
      allowed_link: approvedLink(record),
      reason: { rule_ids: unique(entry.rules.map((rule) => text(rule.id))) },
      gate_impact: {
        blocks_deposit: entry.rules.some((rule) => rule?.blocks_deposit === true),
        blocks_deal: entry.rules.some((rule) => rule?.blocks_deal === true)
      }
    };
  });

  const skipped_documents = [...skipped.entries()].map(([type, entry]) => ({
    type,
    title: text(entry.definition.title || type),
    side: text(entry.definition.side || 'deal'),
    reason: 'side_not_accompanied',
    rule_ids: unique(entry.rules.map((rule) => text(rule.id)))
  }));

  return { document_candidates, skipped_documents, definitions };
}

function taskPlan(draft, catalog, matchedRules, documentTypes) {
  const task_candidates = matchedRules.map((rule) => {
    const role = text(rule?.owner);
    const id = ownerId(draft, role);
    const action = taskAction(rule, catalog);
    const deadline = deadlineContract(draft, [rule]);
    return {
      id: `intake-rule:${text(rule?.id)}`,
      rule_id: text(rule?.id),
      owner: { role, id: id || null },
      assignment_state: id ? 'assigned' : 'needs_assignment',
      action,
      ...deadline,
      evidence: taskEvidence(rule, documentTypes),
      expected_result: taskExpectedResult(rule),
      gate_impact: {
        blocks_deposit: rule?.blocks_deposit === true,
        blocks_deal: rule?.blocks_deal === true
      },
      creation_state: id && action ? 'ready' : id ? 'invalid_contract' : 'needs_owner'
    };
  }).filter((task) => task.action && task.evidence && task.expected_result);

  return {
    task_candidates,
    ready_tasks: task_candidates.filter((task) => task.creation_state === 'ready')
  };
}

export function buildIntakeWorkPlan(draft = {}, catalog = {}, matchedRules = []) {
  const rules = list(matchedRules);
  const documents = documentPlan(draft, catalog, rules);
  const tasks = taskPlan(draft, catalog, rules, documents.definitions);
  return {
    version: NAV_V2_INTAKE_WORK_PLAN_VERSION,
    catalog_version: text(catalog?.catalog_version),
    accompanied_sides: [...accompaniedSides(draft)],
    document_candidates: documents.document_candidates,
    skipped_documents: documents.skipped_documents,
    task_candidates: tasks.task_candidates,
    ready_tasks: tasks.ready_tasks
  };
}
