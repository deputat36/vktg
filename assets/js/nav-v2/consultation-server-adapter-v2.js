import {
  CONSULTATION_CIRCUMSTANCE_OPTIONS,
  normalizeConsultationInput,
  validateConsultationInput
} from './consultation-intake-model-v2.js?v=20260716-02';

const QUEUE_ITEM_KEYS = Object.freeze([
  'id', 'reference', 'status', 'request_type', 'representation_model', 'object_type',
  'stage', 'funding_sources', 'circumstances_count', 'planned_event_date',
  'has_external_documents', 'requester_name', 'requester_role',
  'assigned_lawyer_name', 'message_count', 'latest_message_at', 'created_at',
  'updated_at', 'age_hours', 'priority_code', 'actionable_for_lawyer', 'next_action'
]);

const DETAIL_CONSULTATION_KEYS = Object.freeze([
  'id', 'reference', 'status', 'request_type', 'representation_model', 'object_type',
  'safe_reference', 'stage', 'funding_sources', 'circumstances',
  'planned_event_date', 'has_external_documents', 'response_decision',
  'requester_name', 'requester_role', 'manager_name', 'assigned_lawyer_name',
  'created_at', 'updated_at', 'closed_at'
]);

const MESSAGE_KEYS = Object.freeze([
  'id', 'author_name', 'author_role', 'message_type', 'body', 'created_at'
]);

const PERMISSION_KEYS = Object.freeze(['can_decide', 'can_clarify', 'can_close']);

const REPRESENTATION_MAP = Object.freeze({
  seller: 'seller',
  buyer: 'buyer',
  both: 'both',
  partner: 'partner_agency',
  unknown: 'unknown'
});

const STAGE_MAP = Object.freeze({
  first_question: 'question',
  before_deposit: 'deposit_soon',
  deposit_planned: 'deposit_soon',
  preparing_deal: 'deal_soon',
  urgent: 'question'
});

const REQUEST_TYPE_BY_STAGE = Object.freeze({
  before_deposit: 'deposit_precheck',
  deposit_planned: 'deposit_precheck',
  preparing_deal: 'deal_precheck'
});

const CIRCUMSTANCE_MAP = Object.freeze({
  minor_owner: 'children',
  minor_buyer: 'children',
  minor_registered: 'children',
  power_of_attorney: 'power_of_attorney',
  shares: 'shares',
  inheritance: 'inheritance',
  court: 'court',
  spouse: 'other',
  after_registration: 'after_registration',
  other: 'other'
});

const STAGE_LABELS = Object.freeze({
  first_question: 'первичная консультация',
  before_deposit: 'до задатка',
  deposit_planned: 'задаток уже планируется',
  preparing_deal: 'подготовка сделки',
  urgent: 'срочная проверка перед встречей'
});

const CIRCUMSTANCE_LABELS = new Map(
  CONSULTATION_CIRCUMSTANCE_OPTIONS.map((item) => [item.code, item.label])
);

function clean(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function list(value) {
  return Array.isArray(value) ? [...new Set(value.map(clean).filter(Boolean))] : [];
}

function pick(source, keys) {
  const result = {};
  const value = source && typeof source === 'object' ? source : {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) result[key] = value[key];
  }
  return result;
}

function mappedCircumstances(values) {
  return [...new Set(list(values).map((code) => CIRCUMSTANCE_MAP[code]).filter(Boolean))];
}

function circumstanceText(values) {
  return list(values).map((code) => CIRCUMSTANCE_LABELS.get(code) || code).join(', ');
}

function serverQuestion(value) {
  const lines = [`Вопрос: ${value.question}`];
  if (value.known_facts) lines.push(`Что уже известно: ${value.known_facts}`);
  if (value.circumstances.length) {
    lines.push(`Особые обстоятельства: ${circumstanceText(value.circumstances)}`);
  }
  if (value.stage) lines.push(`Исходная стадия: ${STAGE_LABELS[value.stage] || value.stage}`);
  return lines.join('\n');
}

export function consultationServerPayloadPreview(input = {}) {
  const validation = validateConsultationInput(input);
  if (!validation.ok) {
    return {
      ...validation,
      server_ready: false,
      payload: null,
      adapter_warnings: []
    };
  }

  const value = normalizeConsultationInput(validation.value);
  const question = serverQuestion(value);
  const adapterErrors = [];
  const adapterWarnings = [];

  if (question.length > 4000) {
    adapterErrors.push('Вопрос и известные факты вместе превышают серверный лимит 4000 символов. Сократите текст без потери существенных условий.');
  }
  if (value.documents_url) {
    adapterWarnings.push('Ссылка на документы останется только в локальной передаче: будущий серверный запрос сохранит лишь признак наличия документов.');
  }
  if (value.circumstances.some((code) => ['minor_owner', 'minor_buyer', 'minor_registered', 'spouse'].includes(code))) {
    adapterWarnings.push('Точные обстоятельства сохранены в тексте вопроса; структурированный серверный код использует укрупнённую категорию.');
  }

  const payload = {
    question,
    request_type: REQUEST_TYPE_BY_STAGE[value.stage] || 'legal_answer',
    representation_model: REPRESENTATION_MAP[value.side] || 'unknown',
    object_type: value.object_type || null,
    safe_reference: value.safe_orienter || null,
    stage: STAGE_MAP[value.stage] || 'unknown',
    funding_sources: list(value.funding),
    circumstances: mappedCircumstances(value.circumstances),
    planned_event_date: value.planned_date || null,
    has_external_documents: Boolean(value.documents_url)
  };

  return {
    ...validation,
    ok: validation.ok && adapterErrors.length === 0,
    server_ready: validation.ok && adapterErrors.length === 0,
    errors: [...validation.errors, ...adapterErrors],
    adapter_warnings: adapterWarnings,
    payload,
    persistence: {
      document_url_persisted: false,
      document_presence_persisted: Boolean(value.documents_url),
      known_facts_preserved_in_question: Boolean(value.known_facts),
      deal_created: false,
      backlog_created: false
    }
  };
}

export function minimizeConsultationQueueItem(item = {}) {
  return pick(item, QUEUE_ITEM_KEYS);
}

export function minimizeConsultationQueueResponse(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    profile: pick(source.profile, ['id', 'full_name', 'role']),
    summary: pick(source.summary, ['total', 'new_count', 'need_info_count', 'urgent_high_count', 'actionable_count']),
    items: Array.isArray(source.items) ? source.items.map(minimizeConsultationQueueItem) : []
  };
}

export function minimizeConsultationDetailResponse(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const conversion = source.conversion_draft && typeof source.conversion_draft === 'object'
    ? pick(source.conversion_draft, [
      'consultation_id', 'preparation_mode', 'representation_model', 'object_type',
      'safe_reference', 'funding_sources', 'circumstances', 'planned_event_date',
      'has_external_documents'
    ])
    : null;
  return {
    profile: pick(source.profile, ['id', 'full_name', 'role']),
    consultation: pick(source.consultation, DETAIL_CONSULTATION_KEYS),
    permissions: pick(source.permissions, PERMISSION_KEYS),
    conversion_draft: conversion,
    messages: Array.isArray(source.messages) ? source.messages.map((message) => pick(message, MESSAGE_KEYS)) : []
  };
}

export function consultationDecisionPresentation(decision) {
  return ({
    answer: {
      label: 'Дать ответ',
      next_status: 'answered',
      help: 'Зафиксировать юридический ответ и передать его инициатору.'
    },
    need_info: {
      label: 'Запросить уточнение',
      next_status: 'need_info',
      help: 'Указать конкретный недостающий факт без общего возврата «доработать». '
    },
    convert_to_preparation: {
      label: 'Нужна полная подготовка',
      next_status: 'convert_to_preparation',
      help: 'Вернуть безопасный черновик полного мастера. Сделка и backlog автоматически не создаются.'
    }
  })[clean(decision)] || null;
}

export function consultationConversionToWizardDraft(conversion = {}) {
  const source = conversion && typeof conversion === 'object' ? conversion : {};
  const representation = ({
    seller: 'seller',
    buyer: 'buyer',
    both: 'both',
    one_spn_both: 'one_spn_both',
    partner_agency: 'partner_agency',
    external_party: 'external_party'
  })[source.representation_model] || 'external_party';
  const payments = list(source.funding_sources).map((code) => code === 'military_mortgage' ? 'militaryMortgage' : code);
  const flags = list(source.circumstances).flatMap((code) => ({
    children: ['minorSeller'],
    child_money: ['minorSeller'],
    shares: ['shares'],
    power_of_attorney: ['powerOfAttorney']
  })[code] || []);

  return {
    preparationMode: source.preparation_mode === 'deposit' ? 'deposit'
      : source.preparation_mode === 'deal' ? 'deal'
        : 'consult',
    representation,
    objectType: source.object_type || 'other',
    payments,
    flags: [...new Set(flags)],
    consultationId: source.consultation_id || null,
    consultationSafeOrienter: source.safe_reference || '',
    consultationPlannedDate: source.planned_event_date || '',
    consultationHasExternalDocuments: Boolean(source.has_external_documents)
  };
}

export const CONSULTATION_QUEUE_ITEM_KEYS = QUEUE_ITEM_KEYS;
