const POLICIES = Object.freeze({
  lawyer_handoff_blockers: Object.freeze({
    key: 'lawyer_handoff_blockers',
    kind: 'confirm',
    title: 'Передать юристу с незакрытыми пунктами?',
    description: 'Карточка содержит препятствия, которые желательно устранить или явно передать юристу как известные пробелы.',
    confirmLabel: 'Передать юристу',
    cancelLabel: 'Вернуться к карточке',
    inputLabel: '',
    inputRequired: false,
    minLength: 0,
    interceptSelector: '[data-quick-status="need_lawyer"]'
  }),
  document_problem_reason: Object.freeze({
    key: 'document_problem_reason',
    kind: 'input',
    title: 'Зафиксировать проблему документа',
    description: 'Опишите конкретную причину. Комментарий увидят СПН и юрист, а статус документа изменится на «Проблема».',
    confirmLabel: 'Сохранить проблему',
    cancelLabel: 'Отменить',
    inputLabel: 'Что не так с документом',
    inputRequired: true,
    minLength: 1,
    interceptSelector: '[data-doc-id][data-doc-status="problem"]'
  }),
  risk_resolution_comment: Object.freeze({
    key: 'risk_resolution_comment',
    kind: 'input',
    title: 'Подтвердить изменение риска',
    description: 'Проверьте действие и при необходимости добавьте комментарий к изменению состояния риска.',
    confirmLabel: 'Подтвердить изменение',
    cancelLabel: 'Отменить',
    inputLabel: 'Комментарий к изменению риска',
    inputRequired: false,
    minLength: 0,
    interceptSelector: '[data-risk-resolution]'
  })
});

const NATIVE_CONFIRM_INVENTORY = Object.freeze([
  Object.freeze({ key: 'demo_guard', reason: 'Короткий safety guard без обязательного ввода; нативный confirm сохраняется.' }),
  Object.freeze({ key: 'document_assignment', reason: 'Контекст ответственного и срока уже виден рядом с кнопкой.' }),
  Object.freeze({ key: 'task_due_demo_guard', reason: 'Только подтверждение тестового изменения в демо-сделке.' }),
  Object.freeze({ key: 'spn_rework_final', reason: 'Замечания, причина и последствия уже показаны в раскрытой форме.' }),
  Object.freeze({ key: 'lawyer_document_action', reason: 'Текущий документ, статус и комментарий уже находятся в фокус-блоке.' })
]);

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function accessibleDialogPolicy(key, context = {}) {
  const policy = POLICIES[clean(key)];
  if (!policy) return null;
  const items = Array.isArray(context.items) ? context.items.map(clean).filter(Boolean) : [];
  const actionLabel = clean(context.actionLabel);
  const subject = clean(context.subject);
  const demo = context.demo === true;
  return Object.freeze({
    ...policy,
    title: actionLabel ? `${policy.title}: ${actionLabel}` : policy.title,
    description: subject ? `${policy.description} Объект действия: ${subject}.` : policy.description,
    items: Object.freeze(items),
    demo,
    demoText: demo ? 'Это демо-сделка. Изменение относится только к тестовым данным.' : ''
  });
}

export function accessibleDialogValidation({ key, value = '' } = {}) {
  const policy = POLICIES[clean(key)];
  if (!policy) return Object.freeze({ valid: true, reason: '' });
  const length = clean(value).length;
  if (policy.inputRequired && length < policy.minLength) {
    return Object.freeze({ valid: false, reason: 'required_or_too_short' });
  }
  return Object.freeze({ valid: true, reason: '' });
}

export function accessibleDialogInventory() {
  return Object.freeze({
    controlled: Object.freeze(Object.keys(POLICIES)),
    native: NATIVE_CONFIRM_INVENTORY
  });
}

export function accessibleDialogContract() {
  return Object.freeze({
    nativeDialogPreferred: true,
    roleDialogFallback: true,
    escapeCancelsWithoutMutation: true,
    cancelRestoresTriggerFocus: true,
    serverErrorPreservesInput: true,
    promptReplayIsBounded: true,
    nativeConfirmRetainedWhenReplacementAddsNoValue: true,
    positiveTabindexAllowed: false,
    storageAllowed: false,
    networkAllowed: false
  });
}
