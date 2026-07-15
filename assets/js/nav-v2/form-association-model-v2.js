const FIELD_POLICIES = Object.freeze({
  dealSearch: Object.freeze({
    id: 'dealSearch',
    name: 'Поиск сделок',
    helpIds: Object.freeze(['dealFiltersHelp']),
    statusId: ''
  }),
  dealFilter: Object.freeze({
    id: 'dealFilter',
    name: 'Режим списка сделок',
    helpIds: Object.freeze(['dealFiltersHelp']),
    statusId: ''
  }),
  dealStatus: Object.freeze({
    id: 'dealStatus',
    name: 'Текущий статус сделки',
    helpIds: Object.freeze(['dealStatusHelp']),
    statusId: 'pageStatus'
  }),
  newComment: Object.freeze({
    id: 'newComment',
    name: 'Новый комментарий',
    helpIds: Object.freeze(['newCommentHelp']),
    statusId: 'pageStatus'
  }),
  spnReworkCompletionText: Object.freeze({
    id: 'spnReworkCompletionText',
    name: 'Что именно исправлено',
    helpIds: Object.freeze(['spnReworkCompletionHelp']),
    statusId: 'spnReworkStatusV2'
  }),
  spnReworkReturnReason: Object.freeze({
    id: 'spnReworkReturnReason',
    name: 'Главная причина или другое замечание',
    helpIds: Object.freeze(['spnReworkReturnHelp']),
    statusId: 'spnReworkStatusV2'
  }),
  lawyerDocumentNoteV2: Object.freeze({
    id: 'lawyerDocumentNoteV2',
    name: 'Комментарий к действию по документу',
    helpIds: Object.freeze(['lawyerDocumentNoteHelpV2']),
    statusId: 'lawyerDocumentStatusV2'
  })
});

function clean(value) {
  return String(value || '').trim();
}

export function describedByTokens(value) {
  return [...new Set(clean(value).split(/\s+/).filter(Boolean))];
}

export function fieldAssociationPolicy(fieldId) {
  return FIELD_POLICIES[clean(fieldId)] || null;
}

export function baseDescriptionIds({ existing = '', helpIds = [], statusId = '' } = {}) {
  const status = clean(statusId);
  const base = describedByTokens(existing).filter((id) => id !== status);
  for (const id of helpIds || []) {
    const normalized = clean(id);
    if (normalized && !base.includes(normalized)) base.push(normalized);
  }
  return base;
}

export function validationDescriptionIds({ baseIds = [], statusId = '', invalid = false } = {}) {
  const result = describedByTokens(Array.isArray(baseIds) ? baseIds.join(' ') : baseIds);
  const status = clean(statusId);
  if (invalid && status && !result.includes(status)) result.push(status);
  return result;
}

export function fieldAssociationContract() {
  return Object.freeze({
    fieldIds: Object.freeze(Object.keys(FIELD_POLICIES)),
    placeholderIsNotName: true,
    explicitLabelPreferred: true,
    permanentHelpPreserved: true,
    errorAddedOnlyWhileInvalid: true,
    errorRemovedAfterEdit: true,
    globalStatusNotAttachedByDefault: true,
    unknownFieldsUntouched: true,
    duplicateDescriptionIdsForbidden: true,
    layoutMutationAllowed: false,
    storageAllowed: false,
    networkAllowed: false
  });
}
