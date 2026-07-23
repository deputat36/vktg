const OPEN_TASK_STATUSES = new Set(['open', 'in_progress']);
const PRIORITY_WEIGHT = { urgent: 40, high: 25, normal: 10, low: 0 };
const DEAL_STAGE_LABELS = Object.freeze({
  draft: 'Первичная подготовка',
  need_info: 'Сбор недостающей информации',
  need_lawyer: 'Юридическая проверка',
  need_broker: 'Ипотечное согласование',
  need_documents: 'Подготовка документов',
  ready_for_deposit: 'Готовность к задатку',
  deposit_done: 'Задаток внесён',
  preparing_deal: 'Подготовка договора и расчётов',
  ready_for_deal: 'Готовность к подписанию',
  registration: 'Государственная регистрация',
  registered: 'Переход права зарегистрирован',
  closed: 'Сделка закрыта',
  cancelled: 'Сделка отменена'
});

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function time(value, fallback = Number.MAX_SAFE_INTEGER) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roleName(role) {
  return ({
    owner: 'Владелец',
    admin: 'Администратор',
    manager: 'Менеджер',
    spn: 'СПН',
    lawyer: 'Юрист',
    broker: 'Брокер',
    viewer: 'Наблюдатель'
  })[role] || text(role) || 'Не назначен';
}

function dealStageLabel(status) {
  return DEAL_STAGE_LABELS[text(status)] || 'Этап нужно уточнить';
}

function dayBoundary(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function deadlineState(dueDate, nowValue) {
  if (!dueDate) return 'none';
  const due = dayBoundary(dueDate);
  const today = dayBoundary(nowValue);
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return 'future';
}

function taskScore(task, nowValue) {
  const dueState = deadlineState(task?.due_date, nowValue);
  return (dueState === 'overdue' ? 100 : dueState === 'today' ? 60 : 0)
    + (PRIORITY_WEIGHT[task?.priority] || 0)
    + (task?.status === 'in_progress' ? 8 : 0);
}

function pickPrimaryTask(tasks, nowValue) {
  return tasks
    .filter((task) => OPEN_TASK_STATUSES.has(task?.status))
    .sort((a, b) => {
      const score = taskScore(b, nowValue) - taskScore(a, nowValue);
      if (score !== 0) return score;
      const due = time(a?.due_date) - time(b?.due_date);
      if (due !== 0) return due;
      return text(a?.id).localeCompare(text(b?.id));
    })[0] || null;
}

function taskResponsible(task, profile) {
  if (task?.assigned_to && task.assigned_to === profile?.id) return text(profile?.full_name) || 'Вы';
  if (task?.assigned_to) return 'Назначенный сотрудник';
  if (task?.assigned_role) return roleName(task.assigned_role);
  return 'Не назначен';
}

function taskResultCriteria(task) {
  const source = text(task?.source);
  if (source.startsWith('auto_quality_')) return 'Нужное поле заполнено в карточке, изменения сохранены, а задача отмечена как готовая.';
  if (source === 'auto_lawyer') return 'Юрист зафиксировал результат проверки, а по блокирующим рискам есть решение или комментарий.';
  if (source === 'auto_broker') return 'Проверены источник денег, сроки готовности, условия банка и зафиксирован следующий финансовый шаг.';
  if (text(task?.description)) return `${text(task.description)} После выполнения задача отмечена как готовая.`;
  return 'Результат зафиксирован в карточке, а задача переведена в статус «Готово».';
}

function unresolvedRedRisks(data) {
  return list(data, 'risks').filter((risk) => risk?.level === 'red' && risk?.is_resolved !== true);
}

function missingRequiredDocuments(data) {
  return list(data, 'documents').filter((doc) => doc?.is_required && !['received', 'checked'].includes(doc?.status));
}

function fallbackResponsible(deal, data) {
  const redRisk = unresolvedRedRisks(data)[0];
  if (redRisk?.assigned_role) return roleName(redRisk.assigned_role);
  const missingDoc = missingRequiredDocuments(data)[0];
  if (missingDoc?.responsible_role) return roleName(missingDoc.responsible_role);
  if (deal?.lawyer_needed && !deal?.lawyer_id) return 'Юрист не назначен';
  if (deal?.broker_needed && !deal?.broker_id) return 'Брокер не назначен';
  if (!deal?.manager_id) return 'Менеджер не назначен';
  if (deal?.seller_spn_id || deal?.buyer_spn_id) return 'СПН';
  return 'Ответственный не назначен';
}

function fallbackAction(data) {
  const deal = data?.deal || {};
  const redRisk = unresolvedRedRisks(data)[0] || null;
  if (redRisk) {
    return {
      title: text(redRisk.recommendation) || `Разобрать риск: ${text(redRisk.title) || 'красный риск'}`,
      description: text(redRisk.description),
      responsible: roleName(redRisk.assigned_role),
      dueDate: null,
      deadlineState: 'none',
      resultCriteria: 'Риск получил решение, комментарий ответственного и больше не блокирует следующий этап без объяснения.',
      primaryTab: 'risks',
      source: 'risk'
    };
  }

  const missingDoc = missingRequiredDocuments(data)[0] || null;
  if (missingDoc) {
    return {
      title: `Получить документ: ${text(missingDoc.title) || 'обязательный документ'}`,
      description: text(missingDoc.description),
      responsible: roleName(missingDoc.responsible_role || 'spn'),
      dueDate: missingDoc.due_date || null,
      deadlineState: 'none',
      resultCriteria: 'Документ получен, проверен или по нему зафиксирована конкретная проблема и следующий шаг.',
      primaryTab: 'docs',
      source: 'document'
    };
  }

  return {
    title: text(deal?.next_action) || 'Проверить карточку и определить ближайшее действие',
    description: '',
    responsible: fallbackResponsible(deal, data),
    dueDate: null,
    deadlineState: 'none',
    resultCriteria: 'В карточке зафиксированы ответственный, срок и подтверждённый результат следующего шага.',
    primaryTab: 'overview',
    source: 'deal'
  };
}

function criticalSummary(blockers) {
  const parts = [];
  if (blockers.redRisks) parts.push(`красных рисков: ${blockers.redRisks}`);
  if (blockers.overdueTasks) parts.push(`просроченных задач: ${blockers.overdueTasks}`);
  return parts.length
    ? `До перехода дальше требуется решение по критичным пунктам: ${parts.join(', ')}.`
    : '';
}

function crmRecordHint(focus, deal) {
  const parts = [];

  if (focus.source === 'task') {
    parts.push('после выполнения обновить статус задачи и кратко записать результат');
  } else if (focus.source === 'risk') {
    parts.push('зафиксировать решение профильного специалиста, последствия и условие снятия риска');
  } else if (focus.source === 'document') {
    parts.push('обновить статус документа, срок получения и найденные расхождения');
  } else {
    parts.push('обновить следующий шаг сделки');
  }

  if (!text(focus.responsible) || /не назначен/i.test(text(focus.responsible))) {
    parts.push('назначить ответственного');
  }
  if (!focus.dueDate) parts.push('установить срок');
  if (!text(deal?.next_action)) parts.push('проверить поле «Следующий шаг»');

  return `В основной CRM: ${parts.join('; ')}. В Навигаторе оставить только сведения, необходимые для маршрута, рисков и контроля сделки.`;
}

export function buildDealActionFocus(data, profile, nowValue = Date.now()) {
  const deal = data?.deal || {};
  const tasks = list(data, 'tasks');
  const primaryTask = pickPrimaryTask(tasks, nowValue);
  const redRisks = unresolvedRedRisks(data);
  const missingDocs = missingRequiredDocuments(data);
  const overdueTasks = tasks.filter((task) => OPEN_TASK_STATUSES.has(task?.status) && deadlineState(task?.due_date, nowValue) === 'overdue');

  let focus;
  if (primaryTask) {
    focus = {
      title: text(primaryTask.title) || text(deal.next_action) || 'Выполнить ближайшую задачу',
      description: text(primaryTask.description) || text(deal.next_action),
      responsible: taskResponsible(primaryTask, profile),
      dueDate: primaryTask.due_date || null,
      deadlineState: deadlineState(primaryTask.due_date, nowValue),
      resultCriteria: taskResultCriteria(primaryTask),
      primaryTab: 'tasks',
      relatedTab: primaryTask.source === 'auto_lawyer' ? 'risks' : primaryTask.source === 'auto_broker' ? 'tasks' : 'overview',
      source: 'task',
      taskId: primaryTask.id || null,
      taskStatus: primaryTask.status || null,
      taskPriority: primaryTask.priority || null,
      canChangeTask: primaryTask.can_change_status === true && profile?.role !== 'viewer'
    };
  } else {
    focus = fallbackAction(data);
    focus.deadlineState = deadlineState(focus.dueDate, nowValue);
    focus.relatedTab = focus.primaryTab;
    focus.taskId = null;
    focus.taskStatus = null;
    focus.taskPriority = null;
    focus.canChangeTask = false;
  }

  const blockers = {
    overdueTasks: overdueTasks.length,
    redRisks: redRisks.length,
    missingDocuments: missingDocs.length
  };

  return {
    ...focus,
    dealId: deal.id || null,
    dealStatus: deal.status || null,
    stageLabel: dealStageLabel(deal.status),
    readOnly: profile?.role === 'viewer',
    blockers,
    criticalText: criticalSummary(blockers),
    crmRecord: crmRecordHint(focus, deal),
    readiness: {
      deposit: number(deal.readiness_deposit),
      deal: number(deal.readiness_deal)
    }
  };
}
