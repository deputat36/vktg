export const DOCUMENT_OUTCOME_OPTIONS = Object.freeze([
  { code: 'not_applicable', label: 'Не применимо', terminal: true, confirmation: true, help: 'Документ обоснованно не требуется для этой сделки.' },
  { code: 'replaced', label: 'Заменено другим документом', terminal: true, confirmation: true, help: 'Требование закрывается другим документом.' },
  { code: 'cancelled', label: 'Пункт создан ошибочно / отменён', terminal: true, confirmation: true, help: 'Документный пункт больше не относится к текущему сценарию.' },
  { code: 'external_wait', label: 'Ожидается извне', terminal: false, confirmation: false, help: 'Документ ожидается от банка, нотариуса, госоргана, другой стороны или организации.' },
  { code: 'deferred', label: 'Отложено до следующего этапа', terminal: false, confirmation: false, help: 'Документ будет получен позже; нужна контрольная дата.' }
]);

export const RISK_RESOLUTION_OPTIONS = Object.freeze([
  { code: 'mitigated', label: 'Причина устранена', terminal: true, help: 'Факт риска устранён и подтверждён evidence.' },
  { code: 'not_applicable', label: 'Риск не применим', terminal: true, help: 'Факт не подтвердился или правило не относится к этой сделке.' },
  { code: 'superseded', label: 'Заменён другим риском', terminal: true, help: 'Текущий пункт заменён более точным риском.' },
  { code: 'accepted_by_specialist', label: 'Допустимо при условиях', terminal: true, help: 'Профильный специалист разрешает движение при зафиксированных условиях.' },
  { code: 'cancelled', label: 'Создан ошибочно / отменён', terminal: true, help: 'Риск больше не относится к текущему сценарию.' }
]);

const TERMINAL_DOCUMENT_CODES = new Set(DOCUMENT_OUTCOME_OPTIONS.filter((item) => item.terminal).map((item) => item.code));
const ACTIVE_DOCUMENT_CODES = new Set(DOCUMENT_OUTCOME_OPTIONS.filter((item) => !item.terminal).map((item) => item.code));
const RISK_CODES = new Set(RISK_RESOLUTION_OPTIONS.map((item) => item.code));

function clean(value) {
  return String(value ?? '').trim();
}

export function canConfirmDocumentOutcome(role, responsibleRole, category = '') {
  if (['owner', 'admin'].includes(role)) return true;
  if (role === 'lawyer') return responsibleRole === 'lawyer';
  if (role === 'broker') return responsibleRole === 'broker';
  if (role === 'manager') return ['spn', 'manager'].includes(responsibleRole) || category === 'corporate';
  return false;
}

export function canConfirmRiskResolution(role, assignedRole) {
  if (['owner', 'admin'].includes(role)) return true;
  if (role === 'lawyer') return assignedRole === 'lawyer';
  if (role === 'broker') return assignedRole === 'broker';
  if (role === 'manager') return !assignedRole || ['spn', 'manager'].includes(assignedRole);
  return false;
}

export function validateDocumentOutcome(input = {}) {
  const code = clean(input.code);
  const note = clean(input.note);
  const externalParty = clean(input.externalParty);
  const deferredUntil = clean(input.deferredUntil);
  const replacementDocumentId = clean(input.replacementDocumentId);
  const errors = [];

  if (![...TERMINAL_DOCUMENT_CODES, ...ACTIVE_DOCUMENT_CODES].includes(code)) errors.push('Выберите исход документа.');
  if (!note) errors.push('Коротко объясните причину и что уже сделано.');
  if (code === 'external_wait' && !externalParty) errors.push('Укажите внешнюю сторону или организацию.');
  if (code === 'deferred' && !deferredUntil) errors.push('Укажите контрольную дату.');
  if (code === 'replaced' && !replacementDocumentId) errors.push('Выберите документ, который заменяет текущий.');

  return { valid: errors.length === 0, errors };
}

export function validateRiskResolution(input = {}) {
  const code = clean(input.code);
  const note = clean(input.note);
  const supersededByRiskId = clean(input.supersededByRiskId);
  const errors = [];

  if (!RISK_CODES.has(code)) errors.push('Выберите исход риска.');
  if (!note) errors.push('Опишите evidence, условия или причину решения.');
  if (code === 'superseded' && !supersededByRiskId) errors.push('Выберите риск, который заменяет текущий.');

  return { valid: errors.length === 0, errors };
}

export function documentOutcomePreview(input = {}) {
  const role = clean(input.role);
  const responsibleRole = clean(input.responsibleRole);
  const category = clean(input.category);
  const code = clean(input.code);
  const terminal = TERMINAL_DOCUMENT_CODES.has(code);
  const canConfirm = canConfirmDocumentOutcome(role, responsibleRole, category);

  if (!terminal) {
    return {
      mode: 'active_exception',
      heading: code === 'external_wait' ? 'Зафиксировать внешнее ожидание' : 'Зафиксировать отсрочку',
      readiness: 'Пункт останется активным и продолжит отображаться в работе.',
      actionLabel: 'Проверить оформление',
      tone: 'warn'
    };
  }

  if (canConfirm) {
    return {
      mode: 'confirmable_terminal',
      heading: 'Профильное решение по исходу',
      readiness: 'После production rollout подтверждённый исход сможет исключить документ из missing count с сохранением аудита.',
      actionLabel: 'Предпросмотр подтверждения',
      tone: 'ok'
    };
  }

  return {
    mode: 'proposal',
    heading: 'Предложение исхода профильной роли',
    readiness: 'Предложение не изменит готовность и не снимет gate до подтверждения ответственным специалистом.',
    actionLabel: 'Сформировать предложение',
    tone: 'warn'
  };
}

export function riskResolutionPreview(input = {}) {
  const role = clean(input.role);
  const assignedRole = clean(input.assignedRole);
  const canConfirm = canConfirmRiskResolution(role, assignedRole);

  if (canConfirm) {
    return {
      mode: 'confirmable_terminal',
      heading: 'Профильное решение по риску',
      readiness: 'После production rollout подтверждение снимет только блокировки этого риска; другие gates сохранятся.',
      actionLabel: 'Предпросмотр подтверждения',
      tone: 'ok'
    };
  }

  return {
    mode: 'proposal',
    heading: 'Предложение решения профильной роли',
    readiness: 'Предложение не снимет блокировку риска до подтверждения юристом, ипотечным брокером, менеджером или owner/admin в своей зоне ответственности.',
    actionLabel: 'Сформировать предложение',
    tone: 'warn'
  };
}

export function optionByCode(type, code) {
  const source = type === 'risk' ? RISK_RESOLUTION_OPTIONS : DOCUMENT_OUTCOME_OPTIONS;
  return source.find((item) => item.code === code) || null;
}
