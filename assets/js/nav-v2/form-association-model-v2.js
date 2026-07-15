const FIELD_POLICIES = Object.freeze({
  dealSearch: Object.freeze({
    fieldId: 'dealSearch',
    labelText: 'Поиск сделок',
    helpText: 'Ищет по адресу, объекту, клиенту, СПН, статусу или идентификатору сделки.',
    required: false,
    minLength: 0
  }),
  dealFilter: Object.freeze({
    fieldId: 'dealFilter',
    labelText: 'Режим списка сделок',
    helpText: 'Ограничивает рабочую очередь выбранным режимом, не изменяя данные сделок.',
    required: false,
    minLength: 0
  }),
  dealStatus: Object.freeze({
    fieldId: 'dealStatus',
    labelText: 'Текущий статус',
    helpText: 'Выберите рабочий этап сделки и сохраните изменение.',
    required: true,
    minLength: 1
  }),
  newComment: Object.freeze({
    fieldId: 'newComment',
    labelText: 'Комментарий для команды',
    helpText: 'Коротко зафиксируйте факт, решение или следующий шаг. Пустой комментарий не сохраняется.',
    required: true,
    minLength: 1
  }),
  spnReworkCompletionText: Object.freeze({
    fieldId: 'spnReworkCompletionText',
    labelText: 'Что именно исправлено',
    helpText: 'Перечислите сохранённые изменения. Минимум 10 символов.',
    required: true,
    minLength: 10
  }),
  spnReworkReturnReason: Object.freeze({
    fieldId: 'spnReworkReturnReason',
    labelText: 'Главная причина или другое замечание',
    helpText: 'Выберите хотя бы одно готовое замечание или опишите конкретную причину минимум в 10 символах.',
    required: false,
    minLength: 10,
    alternativeSelector: '[data-spn-rework-option]:checked'
  }),
  lawyerDocumentNoteV2: Object.freeze({
    fieldId: 'lawyerDocumentNoteV2',
    labelText: 'Комментарий к действию',
    helpText: 'Для статуса «Проблема» укажите конкретную причину минимум в 5 символах. Для остальных действий комментарий необязателен.',
    required: false,
    minLength: 5,
    conditionalControlSelector: '[data-lawyer-document-action][data-lawyer-document-note-required="1"]'
  })
});

const GROUP_POLICIES = Object.freeze({
  spnReworkReturnOptions: Object.freeze({
    groupId: 'spnReworkReturnOptions',
    selector: '.spn-rework-options',
    closestSelector: '',
    labelText: 'Замечания для возврата СПН',
    helpText: 'Выберите одно или несколько фактических замечаний либо опишите главную причину ниже.',
    helpId: '',
    validationFieldId: 'spnReworkReturnReason',
    nativeFieldset: true
  }),
  dealQuickStatusActions: Object.freeze({
    groupId: 'dealQuickStatusActions',
    selector: '[data-quick-status]',
    closestSelector: '.actions',
    labelText: 'Быстрое изменение статуса сделки',
    helpText: 'Выберите одно действие. Каждая кнопка сразу запускает соответствующее изменение статуса.',
    helpId: '',
    validationFieldId: '',
    nativeFieldset: false
  }),
  dealLegalActions: Object.freeze({
    groupId: 'dealLegalActions',
    selector: '[data-legal-action]',
    closestSelector: '.actions',
    labelText: 'Юридическое решение по сделке',
    helpText: 'Выберите одно юридическое решение или перейдите к документам и истории решений.',
    helpId: '',
    validationFieldId: '',
    nativeFieldset: false
  }),
  lawyerDocumentActions: Object.freeze({
    groupId: 'lawyerDocumentActions',
    selector: '[data-lawyer-document-action]',
    closestSelector: '.lawyer-document-actions',
    labelText: 'Состояние текущего документа',
    helpText: 'Выберите новое состояние документа. Для проблемы сначала укажите конкретную причину.',
    helpId: '',
    validationFieldId: 'lawyerDocumentNoteV2',
    nativeFieldset: false
  })
});

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function formFieldPolicy(fieldId) {
  const key = clean(fieldId);
  return Object.hasOwn(FIELD_POLICIES, key) ? FIELD_POLICIES[key] : null;
}

export function formFieldIds() {
  return Object.freeze(Object.keys(FIELD_POLICIES));
}

export function formGroupPolicy(groupId) {
  const key = clean(groupId);
  return Object.hasOwn(GROUP_POLICIES, key) ? GROUP_POLICIES[key] : null;
}

export function formGroupIds() {
  return Object.freeze(Object.keys(GROUP_POLICIES));
}

export function mergeDescriptionIds(...values) {
  const ids = values.flatMap((value) => clean(value).split(' ')).filter(Boolean);
  return [...new Set(ids)].join(' ');
}

export function fieldValidationState({ fieldId, value = '', alternativeSelected = false, conditionalRequired = false } = {}) {
  const policy = formFieldPolicy(fieldId);
  if (!policy) return Object.freeze({ invalid: false, required: false, reason: '' });
  const required = policy.required || conditionalRequired;
  const length = clean(value).length;
  if (policy.alternativeSelector && alternativeSelected) {
    return Object.freeze({ invalid: false, required: false, reason: '' });
  }
  if (!required && !length && !policy.alternativeSelector) return Object.freeze({ invalid: false, required: false, reason: '' });
  if (length < policy.minLength) {
    return Object.freeze({
      invalid: true,
      required,
      reason: required ? 'required_or_too_short' : 'alternative_or_too_short'
    });
  }
  return Object.freeze({ invalid: false, required, reason: '' });
}

export function formAssociationContract() {
  return Object.freeze({
    explicitProgrammaticLabel: true,
    helpUsesAriaDescribedby: true,
    fieldErrorUsesAriaErrormessage: true,
    ariaInvalidOnlyForClientFieldError: true,
    ariaInvalidClearsOnInput: true,
    serverErrorDoesNotInvalidateValidField: true,
    nativeFieldsetPreferred: true,
    stableGroupNameRequired: true,
    sharedGroupHelpRequired: true,
    groupErrorMirrorsFieldError: true,
    individualControlNamesPreserved: true,
    nativeKeyboardBehaviorPreserved: true,
    liveAnnouncementOwnedByAsyncFeedback: true,
    positiveTabindexAllowed: false,
    layoutMutationAllowed: false,
    storageAllowed: false,
    networkAllowed: false
  });
}
