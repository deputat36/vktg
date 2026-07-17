export const NAV_V2_LEGAL_PASSPORT_VIEW_VERSION = 1;

const REQUEST_LABELS = {
  check_deposit_possible: 'Проверить, можно ли готовить задаток',
  check_title_basis: 'Проверить основание права',
  check_power_of_attorney: 'Проверить доверенность',
  check_children_guardianship: 'Проверить детей и опеку',
  check_child_money: 'Проверить использование детских денег',
  check_share_sale: 'Проверить продажу доли',
  check_coowner_notices: 'Проверить уведомления сособственников',
  determine_notary: 'Определить необходимость нотариуса',
  check_encumbrance: 'Проверить обременение или арест',
  check_inheritance: 'Проверить наследство',
  check_privatisation: 'Проверить приватизацию',
  check_redevelopment: 'Проверить перепланировку',
  check_bankruptcy: 'Проверить банкротный риск',
  check_post_registration_payment: 'Проверить расчёты после регистрации',
  check_partner_deal: 'Проверить партнёрскую сделку',
  check_document_package: 'Проверить пакет документов',
  design_safe_structure: 'Определить безопасную конструкцию сделки',
  assess_urgent_case: 'Срочно оценить нестандартную ситуацию'
};

const PREPARATION_LABELS = {
  capture_situation: 'сохранение ситуации',
  check_documents: 'проверка документов',
  prepare_deposit: 'подготовка задатка',
  prepare_deal: 'подготовка сделки',
  rework_deal: 'доработка сделки',
  consult: 'консультация',
  check_docs: 'проверка документов',
  deposit: 'подготовка задатка',
  deal: 'подготовка сделки',
  rework: 'доработка сделки'
};

function text(value) {
  return String(value ?? '').trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function firstText(...values) {
  return values.map(text).find(Boolean) || '';
}

function canonicalCandidate(deal) {
  const snapshot = deal?.wizard_snapshot || {};
  const candidates = [snapshot?.deal?.legal_passport, snapshot?.legal_passport, deal?.deal_summary?.legal_passport];
  return candidates.find((candidate) => candidate && typeof candidate === 'object') || null;
}

function cleanFact(item) {
  if (!item || typeof item !== 'object') return null;
  const title = firstText(item.title, item.label, item.id);
  if (!title) return null;
  return { id: text(item.id), title, value: text(item.value) };
}

function cleanRisk(item) {
  if (!item || typeof item !== 'object') return null;
  const id = firstText(item.id, item.code, item.title, 'risk');
  return {
    id,
    title: firstText(item.title, item.label, id),
    level: ['red', 'yellow', 'info', 'green'].includes(item.level) ? item.level : 'yellow',
    blocks_deposit: item.blocks_deposit === true,
    blocks_deal: item.blocks_deal === true
  };
}

function cleanDocument(item) {
  if (!item || typeof item !== 'object') return null;
  const type = firstText(item.type, item.document_type, item.id, 'document');
  return { type, title: firstText(item.title, type), side: firstText(item.side, 'deal') };
}

function cleanDocumentGroups(documents) {
  const result = { available: [], requested: [], missing: [], problem: [] };
  for (const status of Object.keys(result)) result[status] = list(documents?.[status]).map(cleanDocument).filter(Boolean);
  return result;
}

function participantName(data, userId) {
  if (!text(userId)) return '';
  const participant = list(data?.participants).find((item) => text(item?.user_id) === text(userId));
  return firstText(participant?.display_name, participant?.full_name, participant?.email, text(userId).slice(0, 8));
}

function spnBySide(data) {
  const deal = data?.deal || {};
  const snapshot = deal?.wizard_snapshot?.deal || {};
  return {
    seller: firstText(participantName(data, deal.seller_spn_id), snapshot?.seller_spn?.display_name, snapshot?.sellerSpnName),
    buyer: firstText(participantName(data, deal.buyer_spn_id), snapshot?.buyer_spn?.display_name, snapshot?.buyerSpnName)
  };
}

function normalizeCanonical(raw, data) {
  const deal = data?.deal || {};
  const handoff = raw?.handoff_completeness && typeof raw.handoff_completeness === 'object' ? raw.handoff_completeness : {};
  return {
    version: 1,
    request_type: text(raw?.request_type),
    request_title: REQUEST_LABELS[text(raw?.request_type)] || text(raw?.request_type) || 'Юридический запрос не указан',
    requested_decision: text(raw?.requested_decision),
    urgency: text(raw?.urgency),
    target_date: text(raw?.target_date),
    preparation_mode: text(raw?.preparation_mode),
    preparation_title: PREPARATION_LABELS[text(raw?.preparation_mode)] || text(raw?.preparation_mode),
    stage: text(raw?.stage),
    representation_model: text(raw?.representation_model),
    object: {
      type: firstText(raw?.object?.type, deal.object_type),
      address: firstText(raw?.object?.address, deal.address),
      cadastral_number_known: text(raw?.object?.cadastral_number_known)
    },
    confirmed_facts: list(raw?.confirmed_facts).map(cleanFact).filter(Boolean),
    client_reported_facts: list(raw?.client_reported_facts).map(cleanFact).filter(Boolean),
    unknown_facts: list(raw?.unknown_facts).map(cleanFact).filter(Boolean),
    risk_flags: list(raw?.risk_flags).map(cleanRisk).filter(Boolean),
    documents: cleanDocumentGroups(raw?.documents),
    settlements: { status: text(raw?.settlements?.status), known_terms: list(raw?.settlements?.known_terms).map(text).filter(Boolean) },
    expenses: { status: text(raw?.expenses?.status), known_terms: list(raw?.expenses?.known_terms).map(text).filter(Boolean) },
    deposit: {
      required: typeof raw?.deposit?.required === 'boolean' ? raw.deposit.required : null,
      amount_known: typeof raw?.deposit?.amount_known === 'boolean' ? raw.deposit.amount_known : null,
      conditions_known: typeof raw?.deposit?.conditions_known === 'boolean' ? raw.deposit.conditions_known : null
    },
    spn_next_action: firstText(raw?.spn_next_action, deal.next_action),
    lawyer_question: text(raw?.lawyer_question),
    handoff_completeness: { state: firstText(handoff.state, 'unknown'), missing: list(handoff.missing).map(text).filter(Boolean) }
  };
}

function legacyDocuments(data) {
  const result = { available: [], requested: [], missing: [], problem: [] };
  for (const item of list(data?.documents)) {
    const status = item?.status === 'problem'
      ? 'problem'
      : ['received', 'checked', 'available'].includes(item?.status)
        ? 'available'
        : item?.status === 'requested'
          ? 'requested'
          : 'missing';
    result[status].push(cleanDocument({ type: item?.document_type || item?.category, title: item?.title, side: item?.side }) || { type: 'document', title: 'Документ', side: 'deal' });
  }
  return result;
}

function legacyPassport(data, reason = 'missing') {
  const deal = data?.deal || {};
  const snapshot = deal?.wizard_snapshot?.deal || deal?.wizard_snapshot || {};
  const risks = list(data?.risks).filter((item) => item?.is_resolved !== true).map(cleanRisk).filter(Boolean);
  const requestType = firstText(snapshot?.lawyerRequestType, snapshot?.lawyer_request_type);
  const lawyerQuestion = firstText(snapshot?.lawyerQuestion, snapshot?.spn_final?.comment);
  const unknown = [
    { id: 'legacy_source', title: 'Источник значимых фактов в старой карточке не разделён на документ и слова клиента.', value: 'unknown' }
  ];
  if (reason === 'unsupported') unknown.unshift({ id: 'passport_version', title: 'Версия юридического паспорта пока не поддерживается этим экраном.', value: 'unknown' });
  return {
    version: 0,
    request_type: requestType,
    request_title: REQUEST_LABELS[requestType] || (deal.lawyer_needed ? 'Провести первичную юридическую проверку' : 'Юридический запрос не указан'),
    requested_decision: firstText(snapshot?.requestedDecision, lawyerQuestion, deal.lawyer_needed ? 'Определить первый безопасный шаг и недостающие данные.' : ''),
    urgency: firstText(snapshot?.urgency, snapshot?.flags?.includes?.('urgentTerms') ? 'urgent' : ''),
    target_date: firstText(snapshot?.targetDate, snapshot?.nextStepDeadline, snapshot?.depositDate),
    preparation_mode: firstText(snapshot?.requestType, snapshot?.preparationMode, deal.preparation_mode),
    preparation_title: PREPARATION_LABELS[firstText(snapshot?.requestType, snapshot?.preparationMode, deal.preparation_mode)] || firstText(snapshot?.requestType, snapshot?.preparationMode, deal.preparation_mode),
    stage: firstText(snapshot?.stage, deal.stage),
    representation_model: firstText(snapshot?.representation, deal.representation_model),
    object: { type: firstText(snapshot?.objectType, deal.object_type), address: firstText(snapshot?.objectAddress, snapshot?.address, deal.address), cadastral_number_known: 'unknown' },
    confirmed_facts: [],
    client_reported_facts: [],
    unknown_facts: unknown,
    risk_flags: risks,
    documents: legacyDocuments(data),
    settlements: { status: deal.settlements_agreed === true ? 'agreed' : deal.settlements_agreed === false ? 'not_agreed' : 'unknown', known_terms: [] },
    expenses: { status: deal.expenses_agreed === true ? 'agreed' : deal.expenses_agreed === false ? 'not_agreed' : 'unknown', known_terms: [] },
    deposit: { required: null, amount_known: null, conditions_known: null },
    spn_next_action: firstText(deal.next_action, snapshot?.clientNextStep, snapshot?.spn_final?.next_step),
    lawyer_question: lawyerQuestion,
    handoff_completeness: { state: 'legacy_incomplete', missing: ['legal_passport_v1'] }
  };
}

export function buildLegalPassportCardModel(data = {}) {
  const candidate = canonicalCandidate(data?.deal || {});
  const canonical = candidate && Number(candidate.version) === NAV_V2_LEGAL_PASSPORT_VIEW_VERSION;
  const passport = canonical ? normalizeCanonical(candidate, data) : legacyPassport(data, candidate ? 'unsupported' : 'missing');
  return {
    source: canonical ? 'passport_v1' : 'legacy',
    passport,
    spn_by_side: spnBySide(data),
    has_specific_request: Boolean(text(passport.request_type) && text(passport.requested_decision)),
    has_unknowns: passport.unknown_facts.length > 0,
    has_stop_factors: passport.risk_flags.some((risk) => risk.level === 'red' || risk.blocks_deposit || risk.blocks_deal)
  };
}
