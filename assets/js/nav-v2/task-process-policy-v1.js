const TASK_TYPES = new Set([
  'quality_warning',
  'operational_task',
  'legal_blocker',
  'broker_task',
  'system_recommendation'
]);

const ROLE_LABELS = Object.freeze({
  owner: 'руководитель',
  admin: 'администратор',
  manager: 'менеджер',
  spn: 'СПН',
  lawyer: 'юрист',
  broker: 'ипотечный брокер',
  viewer: 'наблюдатель',
  assigned_person: 'назначенный сотрудник'
});

const DEFAULT_OWNER_BY_TYPE = Object.freeze({
  quality_warning: 'spn',
  operational_task: 'spn',
  legal_blocker: 'lawyer',
  broker_task: 'broker',
  system_recommendation: 'manager'
});

const SLA_DAYS_BY_TYPE = Object.freeze({
  quality_warning: 3,
  operational_task: 2,
  legal_blocker: 1,
  broker_task: 2,
  system_recommendation: 5
});

const ACTION_BY_TYPE = Object.freeze({
  quality_warning: 'заполнить недостающие процессные данные и подтвердить результат',
  operational_task: 'выполнить ближайшую рабочую задачу и зафиксировать подтверждённый результат',
  legal_blocker: 'получить решение юриста по юридическому препятствию и зафиксировать результат',
  broker_task: 'уточнить финансовый маршрут с ипотечным брокером и зафиксировать следующий шаг',
  system_recommendation: 'проверить системную рекомендацию и решить, нужна ли отдельная рабочая задача'
});

function text(value) {
  return String(value ?? '').trim();
}

function inferTypeFromSource(sourceValue) {
  const source = text(sourceValue);
  if (source.startsWith('auto_quality_')) return 'quality_warning';
  if (['auto_lawyer', 'auto_children'].includes(source)) return 'legal_blocker';
  if (source === 'auto_broker') return 'broker_task';
  if (['auto_expenses', 'auto_settlements'].includes(source)) return 'operational_task';
  if (source.startsWith('auto_')) return 'system_recommendation';
  return 'operational_task';
}

function dateOnly(value) {
  if (!value) return null;
  const direct = /^\d{4}-\d{2}-\d{2}/.exec(text(value))?.[0] || '';
  if (direct) return direct;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const base = dateOnly(value);
  if (!base) return null;
  const parsed = new Date(`${base}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function dateState(value, nowValue) {
  const due = dateOnly(value);
  const now = dateOnly(nowValue);
  if (!due || !now) return 'unknown';
  if (due < now) return 'overdue';
  if (due === now) return 'today';
  return 'future';
}

export function taskProcessRoleLabel(role) {
  return ROLE_LABELS[text(role)] || text(role) || 'ответственный не назначен';
}

export function classifyTaskForProcess(task = {}, nowValue = Date.now()) {
  const explicitType = TASK_TYPES.has(text(task.task_type)) ? text(task.task_type) : null;
  const taskType = explicitType || inferTypeFromSource(task.source);
  const hasAssignedPerson = Boolean(text(task.assigned_to));
  const explicitRole = text(task.assigned_role);
  const ownerRole = explicitRole || (hasAssignedPerson ? 'assigned_person' : DEFAULT_OWNER_BY_TYPE[taskType]);
  const explicitDueDate = dateOnly(task.due_date);
  const inferredDueDate = explicitDueDate ? null : addDays(task.created_at, SLA_DAYS_BY_TYPE[taskType]);
  const controlDueDate = explicitDueDate || inferredDueDate;

  return {
    task_type: taskType,
    task_type_source: explicitType ? 'explicit_task_type' : 'inferred_from_source',
    owner_role: ownerRole || null,
    owner_label: taskProcessRoleLabel(ownerRole),
    owner_source: explicitRole
      ? 'explicit_assigned_role'
      : hasAssignedPerson
        ? 'explicit_assigned_person'
        : 'inferred_from_task_type',
    sla_days: SLA_DAYS_BY_TYPE[taskType],
    due_date: explicitDueDate,
    control_due_date: controlDueDate,
    deadline_source: explicitDueDate ? 'explicit_due_date' : inferredDueDate ? 'inferred_sla' : 'unknown',
    deadline_state: dateState(controlDueDate, nowValue),
    action_text: ACTION_BY_TYPE[taskType],
    preview_only: true
  };
}

export const TASK_PROCESS_POLICY = Object.freeze({
  task_types: [...TASK_TYPES],
  default_owner_by_type: DEFAULT_OWNER_BY_TYPE,
  sla_days_by_type: SLA_DAYS_BY_TYPE
});
