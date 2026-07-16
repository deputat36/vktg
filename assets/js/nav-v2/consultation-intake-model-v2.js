import {
  detectSensitiveFreeText,
  sensitiveFreeTextMessage
} from './sensitive-free-text-model-v2.js?v=20260716-01';

export const CONSULTATION_ALLOWED_ROLES = Object.freeze(['owner', 'admin', 'manager', 'spn', 'lawyer']);

export const CONSULTATION_FUNDING_OPTIONS = Object.freeze([
  { code: 'cash', label: 'Собственные средства' },
  { code: 'mortgage', label: 'Ипотека' },
  { code: 'military_mortgage', label: 'Военная ипотека / НИС' },
  { code: 'matcap', label: 'Материнский капитал' },
  { code: 'certificate', label: 'Сертификат / субсидия' },
  { code: 'installment', label: 'Рассрочка / остаток долга' }
]);

export const CONSULTATION_CIRCUMSTANCE_OPTIONS = Object.freeze([
  { code: 'minor_owner', label: 'Есть несовершеннолетний собственник' },
  { code: 'minor_buyer', label: 'Есть несовершеннолетний покупатель' },
  { code: 'minor_registered', label: 'Зарегистрированы дети' },
  { code: 'power_of_attorney', label: 'Доверенность' },
  { code: 'shares', label: 'Доли' },
  { code: 'inheritance', label: 'Наследство' },
  { code: 'court', label: 'Решение суда' },
  { code: 'spouse', label: 'Супруг / супруга' },
  { code: 'after_registration', label: 'Расчёт после регистрации' },
  { code: 'other', label: 'Другое существенное обстоятельство' }
]);

const UNIT_LEVEL_RE = /(?:^|[^\p{L}\p{N}])(?:кв(?:артира)?|комн(?:ата)?|офис|помещ(?:ение)?|апарт(?:аменты)?)\s*[№#-]?\s*\d+[а-яa-z]?(?=$|[^\p{L}\p{N}])/iu;
const CADASTRAL_RE = /\b\d{2}:\d{2}:\d{5,9}:\d+\b/u;
const FULL_NAME_HINT_RE = /(?:^|[^\p{L}])[А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ][а-яё]{2,}(?:\s+[А-ЯЁ][а-яё]{2,})?(?=$|[^\p{L}])/u;

const LABELS = Object.freeze({
  side: {
    seller: 'продавец',
    buyer: 'покупатель',
    both: 'обе стороны',
    partner: 'партнёрская сделка',
    unknown: 'пока не определено'
  },
  stage: {
    first_question: 'первичная консультация',
    before_deposit: 'до задатка',
    deposit_planned: 'задаток уже планируется',
    preparing_deal: 'подготовка сделки',
    urgent: 'срочная проверка перед встречей'
  },
  object_type: {
    flat: 'квартира',
    house_land: 'дом с земельным участком',
    land: 'земельный участок',
    room_share: 'комната / доля',
    new_building: 'новостройка / ДДУ',
    commercial: 'коммерческая недвижимость',
    other: 'другой объект'
  }
});

function clean(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function list(value) {
  return Array.isArray(value) ? [...new Set(value.map(clean).filter(Boolean))] : [];
}

function label(group, value) {
  return LABELS[group]?.[value] || clean(value) || 'не указано';
}

function optionLabels(options, values) {
  const map = new Map(options.map((item) => [item.code, item.label]));
  const result = list(values).map((code) => map.get(code) || code);
  return result.length ? result : ['не указано'];
}

export function normalizeConsultationInput(input = {}) {
  return {
    question: clean(input.question),
    side: clean(input.side),
    stage: clean(input.stage),
    object_type: clean(input.object_type),
    safe_orienter: clean(input.safe_orienter),
    funding: list(input.funding),
    circumstances: list(input.circumstances),
    planned_date: clean(input.planned_date),
    documents_url: clean(input.documents_url),
    known_facts: clean(input.known_facts)
  };
}

export function consultationRoleAllowed(role) {
  return CONSULTATION_ALLOWED_ROLES.includes(clean(role));
}

export function consultationPrivacyFindings(input = {}) {
  const value = normalizeConsultationInput(input);
  const findings = [];
  for (const [field, text] of Object.entries({
    question: value.question,
    safe_orienter: value.safe_orienter,
    known_facts: value.known_facts
  })) {
    for (const finding of detectSensitiveFreeText(text)) {
      findings.push({ ...finding, field });
    }
    if (UNIT_LEVEL_RE.test(text)) findings.push({ type: 'unit_level_address', label: 'номер квартиры, комнаты, офиса или помещения', field, count: 1 });
    if (CADASTRAL_RE.test(text)) findings.push({ type: 'cadastral_number', label: 'кадастровый номер', field, count: 1 });
    if (FULL_NAME_HINT_RE.test(text)) findings.push({ type: 'possible_full_name', label: 'возможные ФИО клиента', field, count: 1 });
  }
  return findings;
}

export function consultationRouting(input = {}) {
  const value = normalizeConsultationInput(input);
  const mortgage = value.funding.some((code) => code === 'mortgage' || code === 'military_mortgage');
  const socialFunding = value.funding.some((code) => code === 'matcap' || code === 'certificate');
  const legalPriority = value.stage === 'urgent' || value.stage === 'deposit_planned' || value.circumstances.some((code) => [
    'minor_owner', 'minor_buyer', 'minor_registered', 'power_of_attorney', 'shares', 'inheritance', 'court', 'after_registration'
  ].includes(code));

  return {
    primary_role: 'lawyer',
    parallel_roles: mortgage ? ['broker'] : [],
    lawyer_priority: legalPriority ? 'high' : 'normal',
    broker_needed: mortgage,
    broker_scope: mortgage ? 'Ипотечная консультация, подбор программы и одобрение банка.' : 'Ипотечный брокер не требуется.',
    legal_scope: socialFunding
      ? 'СПН и юрист ведут маткапитал/сертификат, правовую и расчётную схему и оформление сделки.'
      : 'Юрист проверяет правовые условия и определяет дальнейший маршрут.',
    disclaimer: 'Это предварительная маршрутизация, а не юридическое заключение.'
  };
}

export function validateConsultationInput(input = {}) {
  const value = normalizeConsultationInput(input);
  const errors = [];
  const warnings = [];
  const privacy = consultationPrivacyFindings(value);

  if (value.question.length < 12) errors.push('Сформулируйте конкретный вопрос или требуемый результат минимум в 12 символах.');
  if (!value.side) errors.push('Укажите, какую сторону сопровождает компания.');
  if (!value.stage) errors.push('Укажите текущую стадию.');
  if (!value.object_type) errors.push('Укажите тип объекта.');
  if (!value.safe_orienter) errors.push('Добавьте безопасный ориентир без номера квартиры и персональных данных.');
  if (privacy.length) {
    const base = sensitiveFreeTextMessage(privacy);
    const labels = [...new Set(privacy.map((item) => item.label))];
    errors.push(base || `Удалите из свободного текста: ${labels.join(', ')}.`);
  }
  if (value.documents_url && !/^https:\/\//i.test(value.documents_url)) {
    errors.push('Ссылка на документы должна начинаться с https://.');
  }
  if (value.stage === 'deposit_planned' && !value.planned_date) {
    warnings.push('Задаток уже планируется, но дата не указана — юристу будет сложнее определить срочность.');
  }
  if (!value.funding.length) warnings.push('Источник средств не указан. Юрист может запросить уточнение.');

  return { ok: errors.length === 0, errors, warnings, privacy, value };
}

export function buildConsultationHandoff(input = {}) {
  const result = validateConsultationInput(input);
  if (!result.ok) return { ...result, text: '' };
  const value = result.value;
  const routing = consultationRouting(value);
  const funding = optionLabels(CONSULTATION_FUNDING_OPTIONS, value.funding).join(', ');
  const circumstances = optionLabels(CONSULTATION_CIRCUMSTANCE_OPTIONS, value.circumstances).join(', ');
  const lines = [
    'БЫСТРАЯ КОНСУЛЬТАЦИЯ ЮРИСТА',
    '',
    `Вопрос: ${value.question}`,
    `Кого сопровождаем: ${label('side', value.side)}`,
    `Стадия: ${label('stage', value.stage)}`,
    `Объект: ${label('object_type', value.object_type)}`,
    `Безопасный ориентир: ${value.safe_orienter}`,
    `Источник средств: ${funding}`,
    `Особые обстоятельства: ${circumstances}`,
    `Плановая дата: ${value.planned_date || 'не указана'}`,
    `Ссылка на документы: ${value.documents_url || 'пока нет'}`,
    `Известные факты: ${value.known_facts || 'дополнительные факты не указаны'}`,
    '',
    `Предварительный маршрут: юрист${routing.broker_needed ? ' + ипотечный брокер по ипотечной части' : ''}.`,
    routing.legal_scope,
    routing.broker_scope,
    routing.disclaimer,
    '',
    'Ожидаемый ответ юриста: ответ / нужны уточнения / преобразовать в подготовку задатка или сделки.'
  ];
  return { ...result, routing, text: lines.join('\n') };
}

export function consultationToWizardDraft(input = {}) {
  const result = validateConsultationInput(input);
  if (!result.ok) return { ...result, draft: null };
  const value = result.value;
  const representation = value.side === 'seller' ? 'seller'
    : value.side === 'buyer' ? 'buyer'
      : value.side === 'both' ? 'both'
        : value.side === 'partner' ? 'partner_agency'
          : 'external_party';
  const objectType = ({
    flat: 'flat',
    house_land: 'house_land',
    land: 'land',
    room_share: 'share_room',
    new_building: 'new_building',
    commercial: 'commercial',
    other: 'other'
  })[value.object_type] || value.object_type;
  const payments = value.funding.map((code) => code === 'military_mortgage' ? 'militaryMortgage' : code);
  const flags = value.circumstances.map((code) => ({
    minor_owner: 'minorSeller',
    minor_buyer: 'minorBuyer',
    minor_registered: 'minorRegistered',
    power_of_attorney: 'powerOfAttorney',
    shares: 'shares',
    spouse: 'spouse'
  })[code]).filter(Boolean);

  return {
    ...result,
    draft: {
      preparationMode: 'consult',
      representation,
      objectType,
      payments,
      flags,
      spnFinalComment: value.question,
      consultationSafeOrienter: value.safe_orienter,
      consultationStage: value.stage,
      consultationKnownFacts: value.known_facts,
      consultationPlannedDate: value.planned_date,
      consultationDocumentsUrl: value.documents_url
    }
  };
}
