import { detectSensitiveFreeText } from './sensitive-free-text-model-v2.js?v=20260715-01';

export const CONSULTATION_REPRESENTATIONS = Object.freeze([
  { value: 'seller', label: 'Продавца' },
  { value: 'buyer', label: 'Покупателя' },
  { value: 'one_spn_both', label: 'Обе стороны, один СПН' },
  { value: 'both', label: 'Обе стороны, два СПН' },
  { value: 'partner_agency', label: 'Партнёрская сделка' },
  { value: 'unknown', label: 'Пока не ясно' }
]);

export const CONSULTATION_STAGES = Object.freeze([
  { value: 'lead_only', label: 'Есть только клиент или вопрос' },
  { value: 'object_chosen', label: 'Объект выбран' },
  { value: 'terms_discussed', label: 'Условия обсуждаются' },
  { value: 'urgent_deposit', label: 'Срочно планируется задаток' },
  { value: 'deposit_exists', label: 'Задаток уже был' },
  { value: 'main_deal', label: 'Готовится основная сделка' },
  { value: 'legal_problem', label: 'Есть юридическая проблема' }
]);

export const CONSULTATION_OBJECT_TYPES = Object.freeze([
  { value: 'unknown', label: 'Пока не ясно' },
  { value: 'flat_mkd', label: 'Квартира в МКД' },
  { value: 'flat_ground', label: 'Квартира на земле' },
  { value: 'room', label: 'Комната' },
  { value: 'share', label: 'Доля / часть объекта' },
  { value: 'house_land', label: 'Дом с участком' },
  { value: 'land', label: 'Земельный участок' },
  { value: 'new_building', label: 'Новостройка / ДДУ / уступка' },
  { value: 'commercial', label: 'Коммерческий объект' }
]);

export const CONSULTATION_PAYMENTS = Object.freeze([
  { value: 'cash', label: 'Собственные средства' },
  { value: 'mortgage', label: 'Ипотека' },
  { value: 'militaryMortgage', label: 'Военная ипотека / НИС' },
  { value: 'matcap', label: 'Маткапитал' },
  { value: 'certificate', label: 'Сертификат / субсидия' },
  { value: 'nominalChild', label: 'Детский номинальный счёт' },
  { value: 'svoChildAccount', label: 'Деньги детей / СВО' },
  { value: 'installment', label: 'Рассрочка / остаток долга' },
  { value: 'unknown', label: 'Пока не ясно' }
]);

export const CONSULTATION_FLAGS = Object.freeze([
  { value: 'minorSeller', label: 'Ребёнок-собственник' },
  { value: 'minorBuyer', label: 'Ребёнок-покупатель' },
  { value: 'minorRegistered', label: 'Зарегистрированы дети' },
  { value: 'powerOfAttorney', label: 'Доверенность' },
  { value: 'shares', label: 'Доли / сособственники' },
  { value: 'spouse', label: 'Супруг / согласие' },
  { value: 'encumbrance', label: 'Арест / обременение' },
  { value: 'inheritance', label: 'Наследство' },
  { value: 'privatization', label: 'Приватизация' },
  { value: 'court', label: 'Решение суда / спор' },
  { value: 'alternativeDeal', label: 'Цепочка / альтернативная сделка' },
  { value: 'urgentTerms', label: 'Сжатые сроки' },
  { value: 'noneKnown', label: 'Особые обстоятельства пока не известны' }
]);

const LABELS = Object.freeze({
  representation: Object.fromEntries(CONSULTATION_REPRESENTATIONS.map((item) => [item.value, item.label])),
  stage: Object.fromEntries(CONSULTATION_STAGES.map((item) => [item.value, item.label])),
  objectType: Object.fromEntries(CONSULTATION_OBJECT_TYPES.map((item) => [item.value, item.label])),
  payments: Object.fromEntries(CONSULTATION_PAYMENTS.map((item) => [item.value, item.label])),
  flags: Object.fromEntries(CONSULTATION_FLAGS.map((item) => [item.value, item.label]))
});

const UNIT_ADDRESS_RE = /(?:^|[,\s])(кв(?:артира)?|комн(?:ата)?|оф(?:ис)?|пом(?:ещение)?|апарт(?:аменты)?)\.?\s*(?:№|#)?\s*\d+/iu;
const MORTGAGE_PAYMENTS = new Set(['mortgage', 'militaryMortgage']);
const LEGAL_FUNDING = new Set(['matcap', 'certificate', 'nominalChild', 'svoChildAccount']);
const HIGH_RISK_FLAGS = new Set(['minorSeller', 'minorBuyer', 'powerOfAttorney', 'shares', 'encumbrance', 'court']);

function clean(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];
}

function hasAny(values, allowed) {
  return unique(values).some((value) => allowed.has(value));
}

function label(group, value) {
  return LABELS[group]?.[value] || value || 'не указано';
}

function listLabels(group, values) {
  const items = unique(values).map((value) => label(group, value));
  return items.length ? items.join(', ') : 'не указано';
}

function sensitiveFields(input) {
  const checks = [
    ['question', input.question],
    ['knownFacts', input.knownFacts],
    ['safeObjectReference', input.safeObjectReference],
    ['desiredResult', input.desiredResult]
  ];
  return checks.flatMap(([field, value]) => detectSensitiveFreeText(value).map((finding) => ({ field, ...finding })));
}

export function normalizeConsultationIntake(input = {}) {
  return {
    mode: input.mode === 'expert' ? 'expert' : 'guided',
    question: clean(input.question),
    desiredResult: clean(input.desiredResult),
    representation: clean(input.representation),
    stage: clean(input.stage),
    objectType: clean(input.objectType),
    safeObjectReference: clean(input.safeObjectReference),
    payments: unique(input.payments),
    flags: unique(input.flags),
    plannedDate: clean(input.plannedDate),
    documentFolderStatus: clean(input.documentFolderStatus),
    knownFacts: clean(input.knownFacts),
    conversionTarget: ['deposit', 'deal', 'check_docs'].includes(input.conversionTarget) ? input.conversionTarget : 'check_docs'
  };
}

export function validateConsultationIntake(input = {}) {
  const value = normalizeConsultationIntake(input);
  const errors = [];
  const warnings = [];
  const findings = sensitiveFields(value);

  if (value.question.length < 12) errors.push('Сформулируйте конкретный вопрос юристу минимум в одном полном предложении.');
  if (!value.representation) errors.push('Укажите, чью сторону сопровождает офис.');
  if (!value.stage) errors.push('Укажите текущую стадию ситуации.');
  if (!value.objectType) errors.push('Выберите тип объекта или вариант «пока не ясно».');
  if (!value.payments.length) errors.push('Укажите известный источник средств или вариант «пока не ясно».');
  if (findings.length) errors.push('Удалите телефоны, email, паспортные данные, СНИЛС и номера банковских карт.');
  if (UNIT_ADDRESS_RE.test(value.safeObjectReference)) errors.push('Оставьте ориентир без номера квартиры, комнаты, офиса или помещения.');
  if (value.plannedDate && !/^\d{4}-\d{2}-\d{2}$/.test(value.plannedDate)) errors.push('Плановую дату укажите в формате даты.');

  if (!value.safeObjectReference && value.stage !== 'lead_only') warnings.push('Ориентир объекта не указан — юристу может потребоваться уточнение.');
  if (!value.knownFacts) warnings.push('Добавьте 2–4 известных факта, чтобы юристу не восстанавливать контекст устно.');
  if (value.flags.includes('noneKnown') && value.flags.length > 1) errors.push('Нельзя одновременно выбрать известные обстоятельства и вариант «не известны».');
  if (!value.flags.length) warnings.push('Особые обстоятельства не отмечены.');

  return { valid: errors.length === 0, errors, warnings, findings, value };
}

export function routeConsultationIntake(input = {}) {
  const value = normalizeConsultationIntake(input);
  const brokerNeeded = hasAny(value.payments, MORTGAGE_PAYMENTS);
  const legalFunding = hasAny(value.payments, LEGAL_FUNDING);
  const urgent = value.stage === 'urgent_deposit' || value.stage === 'legal_problem' || value.flags.includes('urgentTerms');
  const stopBeforeDeposit = hasAny(value.flags, HIGH_RISK_FLAGS)
    || hasAny(value.payments, new Set(['nominalChild', 'svoChildAccount']))
    || value.stage === 'legal_problem';
  const reasons = ['Ответ на конкретный юридический вопрос'];

  if (legalFunding) reasons.push('Маткапитал, сертификат или детские деньги — контур СПН и юриста');
  if (hasAny(value.flags, HIGH_RISK_FLAGS)) reasons.push('Есть обстоятельство, требующее юридического решения до движения дальше');
  if (value.stage === 'urgent_deposit') reasons.push('Сжатый срок до предполагаемого задатка');
  if (brokerNeeded) reasons.push('Параллельно нужна ипотечная консультация и одобрение');

  return {
    primaryRole: 'lawyer',
    brokerNeeded,
    legalFunding,
    urgent,
    stopBeforeDeposit,
    reasons,
    backlogPolicy: 'no_auto_backlog_before_route_confirmation',
    nextAction: stopBeforeDeposit
      ? 'Передать вопрос юристу и не согласовывать задаток до ответа.'
      : 'Передать структурированный вопрос юристу и дождаться ответа или списка уточнений.',
    brokerAction: brokerNeeded
      ? 'Параллельно подключить ипотечного брокера для консультации, подбора программы и одобрения.'
      : ''
  };
}

export function consultationCompleteness(input = {}) {
  const value = normalizeConsultationIntake(input);
  const checks = [
    Boolean(value.question),
    Boolean(value.representation),
    Boolean(value.stage),
    Boolean(value.objectType),
    value.payments.length > 0,
    value.stage === 'lead_only' || Boolean(value.safeObjectReference),
    Boolean(value.knownFacts)
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function buildConsultationHandoff(input = {}) {
  const validation = validateConsultationIntake(input);
  if (!validation.valid) return { valid: false, errors: validation.errors, text: '' };
  const value = validation.value;
  const route = routeConsultationIntake(value);
  const lines = [
    'БЫСТРАЯ ЮРИДИЧЕСКАЯ КОНСУЛЬТАЦИЯ',
    '',
    `Вопрос: ${value.question}`,
    `Что нужно получить: ${value.desiredResult || 'ответ о допустимости и дальнейших действиях'}`,
    '',
    `Сторона сопровождения: ${label('representation', value.representation)}`,
    `Стадия: ${label('stage', value.stage)}`,
    `Объект: ${label('objectType', value.objectType)}`,
    `Ориентир: ${value.safeObjectReference || 'не указан'}`,
    `Источники средств: ${listLabels('payments', value.payments)}`,
    `Особые обстоятельства: ${listLabels('flags', value.flags)}`,
    `Плановая дата: ${value.plannedDate || 'не указана'}`,
    `Папка документов: ${value.documentFolderStatus || 'статус не указан'}`,
    '',
    `Известные факты: ${value.knownFacts || 'не указаны'}`,
    '',
    `Предварительный маршрут: ${route.nextAction}`
  ];
  if (route.brokerAction) lines.push(`Ипотечный контур: ${route.brokerAction}`);
  lines.push('', 'Важно: это передача фактов и вопроса, а не автоматическое юридическое заключение. Полный список документов и задач создаётся только после подтверждения маршрута.');
  return { valid: true, errors: [], text: lines.join('\n'), route, value };
}

export function buildWizardDraftFromConsultation(input = {}) {
  const validation = validateConsultationIntake(input);
  if (!validation.valid) return { valid: false, errors: validation.errors, draft: null };
  const value = validation.value;
  return {
    valid: true,
    errors: [],
    draft: {
      preparationMode: value.conversionTarget,
      representation: value.representation,
      stage: value.stage,
      objectType: value.objectType === 'unknown' ? '' : value.objectType,
      address: value.safeObjectReference,
      payments: value.payments.filter((item) => item !== 'unknown'),
      flags: value.flags.filter((item) => item !== 'noneKnown'),
      lawyerQuestion: value.question,
      spnFinalComment: value.knownFacts,
      clientNextStep: 'Получить решение юриста и продолжить подготовку по подтверждённому маршруту',
      consultationSource: true,
      consultationDesiredResult: value.desiredResult,
      consultationPlannedDate: value.plannedDate,
      consultationDocumentFolderStatus: value.documentFolderStatus
    }
  };
}

export function consultationResponseOptions() {
  return [
    { value: 'answer', label: 'Дать ответ и условия допустимости' },
    { value: 'need_info', label: 'Запросить конкретные уточнения' },
    { value: 'convert_to_preparation', label: 'Преобразовать в подготовку задатка или сделки' }
  ];
}
