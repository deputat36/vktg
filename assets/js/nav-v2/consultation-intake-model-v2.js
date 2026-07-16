import { detectSensitiveFreeText } from './sensitive-free-text-model-v2.js?v=20260715-01';

export const REPRESENTATIONS = Object.freeze([
  ['seller', 'Продавца'], ['buyer', 'Покупателя'], ['one_spn_both', 'Обе стороны, один СПН'],
  ['both', 'Обе стороны, два СПН'], ['partner_agency', 'Партнёрская сделка'], ['unknown', 'Пока не ясно']
]);
export const STAGES = Object.freeze([
  ['lead_only', 'Есть только клиент или вопрос'], ['object_chosen', 'Объект выбран'],
  ['terms_discussed', 'Условия обсуждаются'], ['urgent_deposit', 'Срочно планируется задаток'],
  ['deposit_exists', 'Задаток уже был'], ['main_deal', 'Готовится основная сделка'],
  ['legal_problem', 'Есть юридическая проблема']
]);
export const OBJECT_TYPES = Object.freeze([
  ['unknown', 'Пока не ясно'], ['flat_mkd', 'Квартира в МКД'], ['flat_ground', 'Квартира на земле'],
  ['room', 'Комната'], ['share', 'Доля / часть объекта'], ['house_land', 'Дом с участком'],
  ['land', 'Земельный участок'], ['new_building', 'Новостройка / ДДУ / уступка'], ['commercial', 'Коммерческий объект']
]);
export const PAYMENTS = Object.freeze([
  ['cash', 'Собственные средства'], ['mortgage', 'Ипотека'], ['militaryMortgage', 'Военная ипотека / НИС'],
  ['matcap', 'Маткапитал'], ['certificate', 'Сертификат / субсидия'], ['nominalChild', 'Детский номинальный счёт'],
  ['svoChildAccount', 'Деньги детей / СВО'], ['installment', 'Рассрочка / остаток долга'], ['unknown', 'Пока не ясно']
]);
export const FLAGS = Object.freeze([
  ['minorSeller', 'Ребёнок-собственник'], ['minorBuyer', 'Ребёнок-покупатель'], ['minorRegistered', 'Зарегистрированы дети'],
  ['powerOfAttorney', 'Доверенность'], ['shares', 'Доли / сособственники'], ['spouse', 'Супруг / согласие'],
  ['encumbrance', 'Арест / обременение'], ['inheritance', 'Наследство'], ['privatization', 'Приватизация'],
  ['court', 'Решение суда / спор'], ['alternativeDeal', 'Цепочка / альтернативная сделка'],
  ['urgentTerms', 'Сжатые сроки'], ['noneKnown', 'Особые обстоятельства пока не известны']
]);

const LABELS = {
  representation: Object.fromEntries(REPRESENTATIONS), stage: Object.fromEntries(STAGES),
  objectType: Object.fromEntries(OBJECT_TYPES), payments: Object.fromEntries(PAYMENTS), flags: Object.fromEntries(FLAGS)
};
const MORTGAGE = new Set(['mortgage', 'militaryMortgage']);
const LEGAL_FUNDING = new Set(['matcap', 'certificate', 'nominalChild', 'svoChildAccount']);
const STOP_FLAGS = new Set(['minorSeller', 'minorBuyer', 'minorRegistered', 'powerOfAttorney', 'shares', 'encumbrance', 'court']);
const UNIT_ADDRESS = /(?:^|[,\s])(кв(?:артира)?|комн(?:ата)?|оф(?:ис)?|пом(?:ещение)?)\.?\s*(?:№|#)?\s*\d+/iu;

const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const unique = (values) => [...new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean))];
const hasAny = (values, set) => unique(values).some((value) => set.has(value));
const label = (group, value) => LABELS[group]?.[value] || value || 'не указано';
const labels = (group, values) => unique(values).map((value) => label(group, value)).join(', ') || 'не указано';

export function normalizeConsultation(input = {}) {
  return {
    mode: input.mode === 'expert' ? 'expert' : 'guided', question: clean(input.question), desiredResult: clean(input.desiredResult),
    representation: clean(input.representation), stage: clean(input.stage), objectType: clean(input.objectType),
    safeObjectReference: clean(input.safeObjectReference), payments: unique(input.payments), flags: unique(input.flags),
    plannedDate: clean(input.plannedDate), documentFolderStatus: clean(input.documentFolderStatus), knownFacts: clean(input.knownFacts),
    conversionTarget: ['deposit', 'deal', 'check_docs'].includes(input.conversionTarget) ? input.conversionTarget : 'check_docs'
  };
}

export function validateConsultation(input = {}) {
  const value = normalizeConsultation(input);
  const errors = [];
  const warnings = [];
  const sensitive = [value.question, value.desiredResult, value.safeObjectReference, value.knownFacts]
    .flatMap((text) => detectSensitiveFreeText(text));
  if (value.question.length < 12) errors.push('Сформулируйте конкретный вопрос юристу минимум в одном полном предложении.');
  if (!value.representation) errors.push('Укажите, чью сторону сопровождает офис.');
  if (!value.stage) errors.push('Укажите текущую стадию ситуации.');
  if (!value.objectType) errors.push('Выберите тип объекта или вариант «пока не ясно».');
  if (!value.payments.length) errors.push('Укажите источник средств или вариант «пока не ясно».');
  if (sensitive.length) errors.push('Удалите телефоны, email, паспортные данные, СНИЛС и номера банковских карт.');
  if (UNIT_ADDRESS.test(value.safeObjectReference)) errors.push('Оставьте ориентир без номера квартиры, комнаты, офиса или помещения.');
  if (value.flags.includes('noneKnown') && value.flags.length > 1) errors.push('Нельзя одновременно выбрать известные обстоятельства и вариант «не известны».');
  if (!value.safeObjectReference && value.stage !== 'lead_only') warnings.push('Ориентир объекта не указан.');
  if (!value.knownFacts) warnings.push('Добавьте 2–4 известных факта.');
  return { valid: errors.length === 0, errors, warnings, value };
}

export function routeConsultation(input = {}) {
  const value = normalizeConsultation(input);
  const brokerNeeded = hasAny(value.payments, MORTGAGE);
  const legalFunding = hasAny(value.payments, LEGAL_FUNDING);
  const stopBeforeDeposit = hasAny(value.flags, STOP_FLAGS) || hasAny(value.payments, new Set(['nominalChild', 'svoChildAccount'])) || value.stage === 'legal_problem';
  const urgent = value.stage === 'urgent_deposit' || value.stage === 'legal_problem' || value.flags.includes('urgentTerms');
  return {
    primaryRole: 'lawyer', brokerNeeded, legalFunding, stopBeforeDeposit, urgent,
    backlogPolicy: 'no_auto_backlog_before_route_confirmation',
    nextAction: stopBeforeDeposit ? 'Передать вопрос юристу и не согласовывать задаток до ответа.' : 'Передать структурированный вопрос юристу и дождаться ответа или списка уточнений.',
    brokerAction: brokerNeeded ? 'Параллельно подключить ипотечного брокера для консультации, подбора программы и одобрения.' : ''
  };
}

export function completeness(input = {}) {
  const v = normalizeConsultation(input);
  const checks = [v.question, v.representation, v.stage, v.objectType, v.payments.length, v.stage === 'lead_only' || v.safeObjectReference, v.knownFacts];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function buildHandoff(input = {}) {
  const validation = validateConsultation(input);
  if (!validation.valid) return { valid: false, errors: validation.errors, text: '' };
  const v = validation.value;
  const route = routeConsultation(v);
  const lines = [
    'БЫСТРАЯ ЮРИДИЧЕСКАЯ КОНСУЛЬТАЦИЯ', '', `Вопрос: ${v.question}`,
    `Что нужно получить: ${v.desiredResult || 'ответ о допустимости и дальнейших действиях'}`, '',
    `Сторона: ${label('representation', v.representation)}`, `Стадия: ${label('stage', v.stage)}`,
    `Объект: ${label('objectType', v.objectType)}`, `Ориентир: ${v.safeObjectReference || 'не указан'}`,
    `Источники средств: ${labels('payments', v.payments)}`, `Особые обстоятельства: ${labels('flags', v.flags)}`,
    `Плановая дата: ${v.plannedDate || 'не указана'}`, `Папка документов: ${v.documentFolderStatus || 'не указано'}`, '',
    `Известные факты: ${v.knownFacts || 'не указаны'}`, '', `Предварительный маршрут: ${route.nextAction}`
  ];
  if (route.brokerAction) lines.push(`Ипотечный контур: ${route.brokerAction}`);
  lines.push('', 'Это передача фактов и вопроса, а не автоматическое юридическое заключение. Полный список документов и задач создаётся только после подтверждения маршрута.');
  return { valid: true, errors: [], text: lines.join('\n'), route, value: v };
}

export function buildWizardDraft(input = {}) {
  const validation = validateConsultation(input);
  if (!validation.valid) return { valid: false, errors: validation.errors, draft: null };
  const v = validation.value;
  return { valid: true, errors: [], draft: {
    preparationMode: v.conversionTarget, representation: v.representation, stage: v.stage,
    objectType: v.objectType === 'unknown' ? '' : v.objectType, address: v.safeObjectReference,
    payments: v.payments.filter((item) => item !== 'unknown'), flags: v.flags.filter((item) => item !== 'noneKnown'),
    lawyerQuestion: v.question, spnFinalComment: v.knownFacts,
    clientNextStep: 'Получить решение юриста и продолжить подготовку по подтверждённому маршруту',
    consultationSource: true, consultationDesiredResult: v.desiredResult,
    consultationPlannedDate: v.plannedDate, consultationDocumentFolderStatus: v.documentFolderStatus
  }};
}

export function responseOptions() {
  return [['answer', 'Дать ответ и условия допустимости'], ['need_info', 'Запросить конкретные уточнения'], ['convert_to_preparation', 'Преобразовать в подготовку задатка или сделки']];
}
