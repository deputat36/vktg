export const NAV_V2_INTAKE_CONTRACT_VERSION = 1;

const RISK_WEIGHT = { red: 4, yellow: 3, info: 2, green: 1 };
const ALLOWED_FACT_VALUES = new Set(['yes', 'no', 'unknown', 'not_applicable']);
const ALLOWED_SOURCES = new Set(['document', 'client', 'unchecked']);
const ALLOWED_DOCUMENT_STATUSES = new Set(['available', 'requested', 'missing', 'problem']);

function text(value) {
  return String(value ?? '').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function factEntry(draft, key) {
  const raw = draft?.facts?.[key];
  if (typeof raw === 'string') return { value: raw, source: 'unchecked' };
  return raw && typeof raw === 'object' ? raw : {};
}

export function normalizeFact(raw) {
  const value = ALLOWED_FACT_VALUES.has(raw?.value) ? raw.value : 'unknown';
  const source = ALLOWED_SOURCES.has(raw?.source) ? raw.source : 'unchecked';
  return { value, source };
}

function matchesShowWhen(draft, showWhen = {}) {
  const selectors = {
    representation: draft?.representation,
    request_type: draft?.requestType,
    object_type: draft?.objectType,
    stage: draft?.stage
  };
  return Object.entries(showWhen).every(([key, allowed]) => {
    if (!Array.isArray(allowed) || !allowed.length) return true;
    return allowed.includes(selectors[key]);
  });
}

export function activeFactQuestions(draft, catalog) {
  return (catalog?.fact_questions || []).filter((question) => matchesShowWhen(draft, question.show_when));
}

function ruleMatches(draft, rule, catalog) {
  const trigger = rule?.trigger || {};
  if (trigger.kind === 'fact') {
    const question = questionMap(catalog).get(trigger.key);
    if (!question || !matchesShowWhen(draft, question.show_when)) return false;
    return (trigger.values || []).includes(normalizeFact(factEntry(draft, trigger.key)).value);
  }
  if (trigger.kind === 'object_type') return (trigger.values || []).includes(draft?.objectType);
  if (trigger.kind === 'representation') return (trigger.values || []).includes(draft?.representation);
  if (trigger.kind === 'stage') return (trigger.values || []).includes(draft?.stage);
  return false;
}

export function matchedIntakeRules(draft, catalog) {
  return (catalog?.rules || [])
    .filter((rule) => ruleMatches(draft, rule, catalog))
    .sort((left, right) => {
      const risk = (RISK_WEIGHT[right.risk_level] || 0) - (RISK_WEIGHT[left.risk_level] || 0);
      return risk || Number(right.priority || 0) - Number(left.priority || 0) || String(left.id).localeCompare(String(right.id));
    });
}

function questionMap(catalog) {
  return new Map((catalog?.fact_questions || []).map((question) => [question.id, question]));
}

function factText(question, value) {
  const prefix = value === 'no' ? 'Нет: ' : 'Да: ';
  return `${prefix}${text(question?.title)}`;
}

function groupFacts(draft, catalog) {
  const grouped = { confirmed: [], reported: [], unknown: [] };
  for (const question of activeFactQuestions(draft, catalog)) {
    const fact = normalizeFact(factEntry(draft, question.id));
    if (fact.value === 'not_applicable') continue;
    if (fact.value === 'unknown') {
      grouped.unknown.push({ id: question.id, title: question.title });
      continue;
    }
    const item = { id: question.id, title: factText(question, fact.value), value: fact.value };
    if (fact.source === 'document') grouped.confirmed.push(item);
    else if (fact.source === 'client') grouped.reported.push(item);
    else grouped.unknown.push({ id: question.id, title: `${question.title} — источник не подтверждён` });
  }
  return grouped;
}

function groupDocuments(draft) {
  const grouped = { available: [], requested: [], missing: [], problem: [] };
  for (const document of Array.isArray(draft?.documents) ? draft.documents : []) {
    if (!ALLOWED_DOCUMENT_STATUSES.has(document?.status)) continue;
    grouped[document.status].push({
      type: text(document.type),
      title: text(document.title || document.type),
      side: text(document.side || 'company')
    });
  }
  return grouped;
}

function primaryLawyerRule(rules) {
  return rules.find((rule) => rule.owner === 'lawyer' && rule.lawyer_request_type) || null;
}

function factState(draft, key) {
  return normalizeFact(factEntry(draft, key)).value;
}

function agreementStatus(value) {
  if (value === 'yes') return 'agreed';
  if (value === 'no') return 'not_agreed';
  if (value === 'not_applicable') return 'not_applicable';
  return 'unknown';
}

function targetDate(draft) {
  return draft?.dateUnknown ? null : text(draft?.targetDate) || null;
}

export function buildLegalPassport(draft, catalog) {
  if (Number(catalog?.contract_version) !== NAV_V2_INTAKE_CONTRACT_VERSION) {
    throw new Error(`Unsupported Navigator intake contract: ${catalog?.contract_version ?? 'missing'}`);
  }
  const rules = matchedIntakeRules(draft, catalog);
  const facts = groupFacts(draft, catalog);
  const documents = groupDocuments(draft);
  const primary = primaryLawyerRule(rules);
  const selectedRequest = text(draft?.lawyerRequestType);
  const selectedDecision = text(draft?.requestedDecision);

  return {
    version: NAV_V2_INTAKE_CONTRACT_VERSION,
    catalog_version: text(catalog.catalog_version),
    request_type: selectedRequest || primary?.lawyer_request_type || '',
    requested_decision: selectedDecision || primary?.expected_decision || '',
    urgency: text(draft?.urgency),
    target_date: targetDate(draft),
    preparation_mode: text(draft?.requestType),
    stage: text(draft?.stage),
    representation_model: text(draft?.representation),
    object: {
      type: text(draft?.objectType),
      address: text(draft?.objectAddress || draft?.objectLabel),
      cadastral_number_known: ['yes', 'no', 'unknown'].includes(draft?.cadastralNumberKnown)
        ? draft.cadastralNumberKnown
        : 'unknown'
    },
    confirmed_facts: facts.confirmed,
    client_reported_facts: facts.reported,
    unknown_facts: facts.unknown,
    risk_flags: rules.map((rule) => ({
      id: rule.id,
      level: rule.risk_level,
      blocks_deposit: Boolean(rule.blocks_deposit),
      blocks_deal: Boolean(rule.blocks_deal),
      owner: rule.owner,
      required_documents: unique(rule.documents || [])
    })),
    documents,
    settlements: {
      status: agreementStatus(factState(draft, 'settlements_agreed')),
      known_terms: Array.isArray(draft?.settlementTerms) ? draft.settlementTerms.map(text).filter(Boolean) : []
    },
    expenses: {
      status: agreementStatus(factState(draft, 'expenses_agreed')),
      known_terms: Array.isArray(draft?.expenseTerms) ? draft.expenseTerms.map(text).filter(Boolean) : []
    },
    deposit: {
      required: draft?.depositRequired === true ? true : draft?.depositRequired === false ? false : null,
      amount_known: draft?.depositAmountKnown === true ? true : draft?.depositAmountKnown === false ? false : null,
      conditions_known: draft?.depositConditionsKnown === true ? true : draft?.depositConditionsKnown === false ? false : null
    },
    spn_next_action: text(draft?.nextAction),
    lawyer_question: text(draft?.lawyerQuestion),
    specialists: {
      lawyer: rules.some((rule) => rule.owner === 'lawyer'),
      broker: rules.some((rule) => rule.owner === 'broker'),
      broker_scope: rules.some((rule) => rule.owner === 'broker') ? 'mortgage_only' : 'not_required'
    },
    handoff_completeness: { state: 'not_evaluated', missing: [] }
  };
}

function missingItem(id, title, critical = false) {
  return { id, title, critical };
}

function hasObjectOrReason(draft) {
  return Boolean(text(draft?.objectType) && draft.objectType !== 'not_selected') || Boolean(text(draft?.objectNotSelectedReason));
}

function hasLeadingSpn(draft) {
  return draft?.leadSpnConfirmed === true || Boolean(text(draft?.sellerSpnId) || text(draft?.buyerSpnId));
}

function documentCount(passport) {
  return Object.values(passport?.documents || {}).reduce((total, rows) => total + (Array.isArray(rows) ? rows.length : 0), 0);
}

function missingRequiredDocuments(passport) {
  const required = unique((passport?.risk_flags || []).flatMap((risk) => risk.required_documents || []));
  if (!required.length) return [];
  const recorded = new Set(Object.values(passport?.documents || {}).flat().map((document) => document.type));
  return required.filter((type) => !recorded.has(type));
}

export function evaluateIntakeGates(draft, passport) {
  const draftMissing = [];
  if (!text(draft?.requestType)) draftMissing.push(missingItem('request_type', 'Что сейчас нужно'));
  if (!text(draft?.stage)) draftMissing.push(missingItem('stage', 'Текущая стадия'));
  if (!text(draft?.representation)) draftMissing.push(missingItem('representation', 'Кого сопровождает агентство'));
  if (!hasObjectOrReason(draft)) draftMissing.push(missingItem('object', 'Тип объекта или причина, почему он ещё не выбран'));

  const cardMissing = [...draftMissing];
  if (!hasLeadingSpn(draft)) cardMissing.push(missingItem('lead_spn', 'Ведущий СПН'));
  if (!text(draft?.nextAction)) cardMissing.push(missingItem('next_action', 'Следующий шаг'));
  if (!targetDate(draft) && draft?.dateUnknown !== true) cardMissing.push(missingItem('target_date', 'Ближайшая дата или отметка «дата не определена»'));

  const handoffMissing = [];
  if (!text(passport?.request_type)) handoffMissing.push(missingItem('lawyer_request_type', 'Конкретный тип запроса юристу', true));
  if (!text(passport?.requested_decision)) handoffMissing.push(missingItem('requested_decision', 'Какое решение ожидается от юриста', true));
  if (draft?.lawyerRequestConfirmed !== true) handoffMissing.push(missingItem('lawyer_request_confirmation', 'Подтверждение запроса и ожидаемого решения', true));
  if (!text(passport?.urgency) && !passport?.target_date) handoffMissing.push(missingItem('urgency', 'Срочность или срок'));
  if (!hasObjectOrReason(draft)) handoffMissing.push(missingItem('object', 'Объект или причина его отсутствия', true));
  if (!text(passport?.representation_model)) handoffMissing.push(missingItem('representation', 'Модель сопровождения', true));
  if (!(passport?.confirmed_facts?.length || passport?.client_reported_facts?.length)) handoffMissing.push(missingItem('known_facts', 'Хотя бы один известный факт'));
  if (!Array.isArray(passport?.unknown_facts)) handoffMissing.push(missingItem('unknown_facts', 'Список неизвестных фактов'));
  if (!Array.isArray(passport?.risk_flags)) handoffMissing.push(missingItem('risk_flags', 'Список найденных рисков'));
  const requiredDocumentsMissing = missingRequiredDocuments(passport);
  if (requiredDocumentsMissing.length) {
    handoffMissing.push(missingItem('documents', `Статус обязательных документов: ${requiredDocumentsMissing.join(', ')}`));
  } else if (!draft?.documentsReviewed && documentCount(passport) === 0) {
    handoffMissing.push(missingItem('documents', 'Статус ключевых документов'));
  }
  if (!text(passport?.spn_next_action)) handoffMissing.push(missingItem('next_action', 'Следующий шаг СПН', true));

  const urgent = ['urgent', 'critical'].includes(text(passport?.urgency));
  const criticalMissing = handoffMissing.filter((item) => item.critical);
  const handoffState = handoffMissing.length === 0
    ? 'ready'
    : urgent && criticalMissing.length === 0
      ? 'urgent_incomplete'
      : 'blocked';

  return {
    save_draft: { allowed: draftMissing.length === 0, missing: draftMissing },
    form_card: { allowed: cardMissing.length === 0, missing: cardMissing },
    handoff_lawyer: {
      allowed: handoffState === 'ready' || handoffState === 'urgent_incomplete',
      state: handoffState,
      missing: handoffMissing
    }
  };
}

export function buildIntakeAssessment(draft, catalog) {
  const passport = buildLegalPassport(draft, catalog);
  const gates = evaluateIntakeGates(draft, passport);
  passport.handoff_completeness = {
    state: gates.handoff_lawyer.state,
    missing: gates.handoff_lawyer.missing.map((item) => item.id)
  };
  return {
    route: ['situation', 'facts', 'review'],
    active_questions: activeFactQuestions(draft, catalog).map((question) => question.id),
    passport,
    gates
  };
}

export function adaptLegacyWizardDraft(legacy = {}) {
  const flags = new Set(Array.isArray(legacy.flags) ? legacy.flags : []);
  const payments = new Set(Array.isArray(legacy.payments) ? legacy.payments : []);
  const basis = new Set(Array.isArray(legacy.basis) ? legacy.basis : []);
  const settlements = new Set(Array.isArray(legacy.settlements) ? legacy.settlements : []);
  const yes = (condition) => ({ value: condition ? 'yes' : 'unknown', source: 'unchecked' });

  return {
    requestType: ({ consult: 'capture_situation', check_docs: 'check_documents', deposit: 'prepare_deposit', deal: 'prepare_deal', rework: 'rework_deal' })[legacy.preparationMode] || '',
    representation: text(legacy.representation),
    stage: text(legacy.stage),
    objectType: text(legacy.objectType) || (legacy.stage === 'lead_only' ? 'not_selected' : ''),
    objectAddress: text(legacy.objectAddress || legacy.objectLabel || legacy.address),
    objectNotSelectedReason: legacy.stage === 'lead_only' && !legacy.objectType ? 'Объект ещё не выбран' : '',
    urgency: flags.has('urgentTerms') || legacy.stage === 'urgent_deposit' ? 'urgent' : 'normal',
    targetDate: text(legacy.nextStepDeadline || legacy.depositDate),
    dateUnknown: !text(legacy.nextStepDeadline || legacy.depositDate),
    leadSpnConfirmed: true,
    nextAction: text(legacy.clientNextStep || legacy?.spn_final?.next_step),
    lawyerRequestType: text(legacy.lawyerRequestType),
    requestedDecision: text(legacy.requestedDecision || legacy.lawyerQuestion),
    lawyerQuestion: text(legacy.lawyerQuestion),
    documentsReviewed: false,
    facts: {
      minor_seller: yes(flags.has('minorSeller')),
      minor_buyer: yes(flags.has('minorBuyer')),
      minor_registered: yes(flags.has('minorRegistered')),
      shares: yes(flags.has('shares') || legacy.objectType === 'share'),
      spouse: yes(flags.has('spouse')),
      power_of_attorney: yes(flags.has('powerOfAttorney')),
      seller_absent: yes(flags.has('sellerWillNotAttend')),
      encumbrance: yes(flags.has('encumbrance')),
      inheritance: yes(basis.has('inheritLaw') || basis.has('inheritWill')),
      privatisation: yes(basis.has('privat')),
      court_basis: yes(basis.has('court')),
      bankruptcy_risk: yes(flags.has('sellerBankruptcyRisk')),
      buyer_chain: yes(legacy.buyerChain === true || flags.has('alternativeDeal')),
      redevelopment: yes(flags.has('redevelopment')),
      mortgage: yes(payments.has('mortgage')),
      military_mortgage: yes(payments.has('militaryMortgage')),
      matcap: yes(payments.has('matcap')),
      certificate: yes(payments.has('certificate')),
      child_money: yes(payments.has('nominalChild') || payments.has('svoChildAccount')),
      installment: yes(payments.has('installment')),
      settlements_agreed: { value: legacy.settlementsAgreed === true ? 'yes' : legacy.settlementsAgreed === false ? 'no' : 'unknown', source: 'unchecked' },
      expenses_agreed: { value: legacy.expensesAgreed === true ? 'yes' : legacy.expensesAgreed === false ? 'no' : 'unknown', source: 'unchecked' },
      after_registration: yes(settlements.has('afterRegistration')),
      partner_responsibility_clear: { value: legacy.representation === 'partner_agency' && text(legacy.partnerAgencyComment) ? 'yes' : 'unknown', source: 'unchecked' }
    },
    documents: []
  };
}

export function validateIntakeCatalog(catalog) {
  const errors = [];
  if (Number(catalog?.contract_version) !== NAV_V2_INTAKE_CONTRACT_VERSION) errors.push('contract_version must be 1');
  if ((catalog?.steps || []).length !== 3) errors.push('exactly three top-level steps are required');
  const questions = questionMap(catalog);
  const ruleIds = new Set();
  for (const rule of catalog?.rules || []) {
    if (!rule.id || ruleIds.has(rule.id)) errors.push(`duplicate or missing rule id: ${rule.id || 'missing'}`);
    ruleIds.add(rule.id);
    if (rule.trigger?.kind === 'fact' && !questions.has(rule.trigger.key)) errors.push(`unknown fact in rule ${rule.id}: ${rule.trigger.key}`);
    if (rule.owner === 'broker' && !['mortgage', 'military_mortgage'].includes(rule.id)) errors.push(`broker scope violation: ${rule.id}`);
  }
  return { valid: errors.length === 0, errors };
}
