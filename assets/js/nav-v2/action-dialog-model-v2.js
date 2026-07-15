const NATIVE_DIALOG_INVENTORY = Object.freeze([
  Object.freeze({ id: 'deal-demo-guard', source: 'deal-card-v2.js', kind: 'confirm', decision: 'keep_native', reason: 'Короткое бинарное подтверждение только для демо-сделки.' }),
  Object.freeze({ id: 'deal-lawyer-handoff', source: 'deal-card-v2.js', kind: 'confirm', decision: 'candidate', reason: 'Длинный перечень незакрытых пунктов требует отдельного controlled review.' }),
  Object.freeze({ id: 'deal-document-problem', source: 'deal-card-v2.js', kind: 'prompt', decision: 'candidate', reason: 'Обязательная причина и recovery требуют отдельного controlled input slice.' }),
  Object.freeze({ id: 'spn-rework-unresolved', source: 'deal-card-spn-rework-v2.js', kind: 'confirm', decision: 'keep_native', reason: 'Контекст уже показан рядом с запускающей кнопкой.' }),
  Object.freeze({ id: 'spn-rework-demo-submit', source: 'deal-card-spn-rework-v2.js', kind: 'confirm', decision: 'keep_native', reason: 'Короткий demo guard.' }),
  Object.freeze({ id: 'spn-rework-demo-return', source: 'deal-card-spn-rework-v2.js', kind: 'confirm', decision: 'keep_native', reason: 'Короткий demo guard.' }),
  Object.freeze({ id: 'spn-rework-return', source: 'deal-card-spn-rework-v2.js', kind: 'confirm', decision: 'keep_native', reason: 'Замечания, причина и последствия уже находятся в раскрытой форме.' }),
  Object.freeze({ id: 'lawyer-document-demo', source: 'deal-card-lawyer-document-cycle-v2.js', kind: 'confirm', decision: 'keep_native', reason: 'Короткий demo guard.' }),
  Object.freeze({ id: 'lawyer-document-action', source: 'deal-card-lawyer-document-cycle-v2.js', kind: 'confirm', decision: 'keep_native', reason: 'Название документа, действие и комментарий уже видны в одном блоке.' }),
  Object.freeze({ id: 'risk-resolution', source: 'deal-card-risk-resolution-v2.js', kind: 'confirm_prompt', decision: 'replace_now', reason: 'Два последовательных нативных окна разрывают контекст и теряют необязательный комментарий при cancel/server error.' })
]);

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function nativeDialogInventory() {
  return NATIVE_DIALOG_INVENTORY;
}

export function nativeDialogDecision(id) {
  return NATIVE_DIALOG_INVENTORY.find((item) => item.id === clean(id)) || null;
}

export function buildRiskResolutionDialog({ nextState = true, isDemo = false, riskTitle = '' } = {}) {
  const resolved = nextState === true;
  const action = resolved ? 'Устранить риск' : 'Вернуть риск в работу';
  const description = resolved
    ? 'Риск будет отмечен как устранён. Состояние сохранится в карточке и станет видно участникам сделки.'
    : 'Риск снова станет открытым и вернётся в рабочий контроль участников сделки.';
  const details = [];
  const title = clean(riskTitle);
  if (title) details.push(`Риск: ${title}`);
  if (isDemo) details.push('Это демо-сделка. Действие затронет только тестовые данные этой карточки.');
  return Object.freeze({
    id: 'risk-resolution',
    title: action,
    description,
    details: Object.freeze(details),
    confirmLabel: action,
    cancelLabel: 'Отмена',
    tone: resolved ? 'positive' : 'warning',
    input: Object.freeze({
      label: 'Комментарий к изменению риска',
      description: 'Необязательно. Коротко поясните, что изменилось или почему риск возвращается в работу.',
      required: false,
      minLength: 0,
      multiline: true
    })
  });
}

export function actionDialogContract() {
  return Object.freeze({
    nativeDialogPreferred: true,
    confirmPromptFallbackAllowed: true,
    escapeCancelsMutation: true,
    cancelButtonRequired: true,
    focusReturnsToTrigger: true,
    inputDraftMemoryOnly: true,
    draftPreservedOnCancel: true,
    draftPreservedOnServerError: true,
    draftClearedOnlyAfterSuccess: true,
    stableAccessibleNameRequired: true,
    stableAccessibleDescriptionRequired: true,
    positiveTabindexAllowed: false,
    storageAllowed: false,
    networkAllowed: false,
    rpcAllowed: false
  });
}
