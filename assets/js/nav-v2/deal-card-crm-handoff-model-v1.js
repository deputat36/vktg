import {
  classifyTaskForProcess,
  taskProcessRoleLabel
} from './task-process-policy-v1.js?v=20260723-01';

const TERMINAL_DOCUMENT_OUTCOMES = new Set(['not_applicable', 'replaced', 'cancelled']);
const TERMINAL_RISK_OUTCOMES = new Set(['mitigated', 'not_applicable', 'superseded', 'accepted_by_specialist', 'cancelled']);

const STATUS_LABELS = {
  draft: 'первичная подготовка',
  need_info: 'сбор и уточнение информации',
  need_lawyer: 'юридическая проверка',
  need_broker: 'согласование финансового маршрута',
  need_documents: 'подготовка недостающих документов',
  ready_for_deposit: 'готовность к задатку',
  deposit_done: 'задаток внесён',
  preparing_deal: 'подготовка основной сделки',
  ready_for_deal: 'готовность к основной сделке',
  registration: 'государственная регистрация',
  registered: 'переход права зарегистрирован',
  closed: 'сделка закрыта',
  cancelled: 'сделка отменена'
};

const ROLE_LABELS = {
  owner: 'руководитель',
  admin: 'администратор',
  manager: 'менеджер',
  spn: 'СПН',
  lawyer: 'юрист',
  broker: 'ипотечный брокер',
  viewer: 'наблюдатель',
  assigned_person: 'назначенный сотрудник'
};

function items(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function isConfirmedTerminalDocument(document) {
  return document?.outcome_state === 'confirmed' && TERMINAL_DOCUMENT_OUTCOMES.has(document?.outcome_code);
}

function isOpenDocument(document) {
  return document?.is_required === true
    && !['received', 'checked'].includes(document?.status)
    && !isConfirmedTerminalDocument(document);
}

function isConfirmedTerminalRisk(risk) {
  return risk?.resolution_state === 'confirmed' && TERMINAL_RISK_OUTCOMES.has(risk?.resolution_code);
}

function isOpenRisk(risk) {
  return risk?.is_resolved !== true && !isConfirmedTerminalRisk(risk);
}

function riskIsBlocking(risk) {
  return isOpenRisk(risk) && (risk?.level === 'red' || risk?.blocks_deposit === true || risk?.blocks_deal === true);
}

function isOpenTask(task) {
  return ['open', 'in_progress'].includes(task?.status);
}

function isBlockingReview(review) {
  return review?.decision === 'blocked' || review?.blocks_deposit === true || review?.blocks_deal === true;
}

function priorityRank(priority) {
  return ({ urgent: 0, high: 1, normal: 2, low: 3 })[priority] ?? 4;
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function earliestDue(itemsList) {
  return itemsList
    .map((item) => validDate(item?.due_date))
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime())[0] || null;
}

function formatDate(date) {
  return date ? new Intl.DateTimeFormat('ru-RU').format(date) : '';
}

function roleTitle(role) {
  return ROLE_LABELS[role] || taskProcessRoleLabel(role);
}

function stageTitle(status) {
  return STATUS_LABELS[status] || text(status) || 'этап не определён';
}

function resultText(deal, openTasks, missingDocuments, blockingRisks, blockingReviews) {
  if (deal?.status === 'closed') return 'Переход права, расчёты и передача должны быть подтверждены перед окончательным архивированием.';
  if (deal?.status === 'registered') return 'Переход права зарегистрирован; требуется проконтролировать расчёты, передачу объекта и закрывающие действия.';

  const deposit = Number.isFinite(Number(deal?.readiness_deposit)) ? Number(deal.readiness_deposit) : null;
  const transaction = Number.isFinite(Number(deal?.readiness_deal)) ? Number(deal.readiness_deal) : null;
  const readiness = [];
  if (deposit !== null) readiness.push(`к задатку ${deposit}%`);
  if (transaction !== null) readiness.push(`к сделке ${transaction}%`);
  const counters = `${missingDocuments.length} документов, ${openTasks.length} задач, ${blockingRisks.length + blockingReviews.length} блокирующих пунктов`;
  return `${readiness.length ? `Готовность: ${readiness.join(', ')}. ` : ''}Открыто: ${counters}.`;
}

function obstacleText(blockingRisks, blockingReviews, missingDocuments) {
  const parts = [];
  if (blockingRisks.length) parts.push(`блокирующие риски: ${blockingRisks.length}`);
  if (blockingReviews.length) parts.push(`блокирующие решения: ${blockingReviews.length}`);
  if (missingDocuments.length) parts.push(`обязательные документы: ${missingDocuments.length}`);
  return parts.length
    ? `Требуют решения или устранения: ${parts.join(', ')}.`
    : 'Критичные препятствия по загруженной карточке не выявлены; профильные проверки остаются обязательными.';
}

function agreementText(deal) {
  const expenses = deal?.expenses_agreed === true;
  const settlements = deal?.settlements_agreed === true;
  if (expenses && settlements) return 'Расходы и порядок расчётов отмечены как согласованные.';
  if (expenses) return 'Расходы согласованы; порядок расчётов ещё требует согласования.';
  if (settlements) return 'Порядок расчётов согласован; распределение расходов ещё требует согласования.';
  return 'Расходы и порядок расчётов ещё не подтверждены как согласованные.';
}

function missingText(missingDocuments, unownedTasks) {
  const parts = [];
  if (missingDocuments.length) parts.push(`${missingDocuments.length} обязательных документов`);
  if (unownedTasks.length) parts.push(`${unownedTasks.length} открытых задач без явного ответственного`);
  return parts.length ? parts.join('; ') + '.' : 'Обязательные пробелы для процессной записи не обнаружены.';
}

function classifyOpenTasks(openTasks, nowValue) {
  return openTasks.map((task) => ({
    task,
    policy: classifyTaskForProcess(task, nowValue)
  }));
}

function taskSort(left, right) {
  const priority = priorityRank(left.task?.priority) - priorityRank(right.task?.priority);
  if (priority !== 0) return priority;
  const leftDue = validDate(left.policy?.control_due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightDue = validDate(right.policy?.control_due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (leftDue !== rightDue) return leftDue - rightDue;
  return text(left.task?.id).localeCompare(text(right.task?.id));
}

function chooseNextAction(deal, classifiedTasks, missingDocuments, blockingRisks, blockingReviews) {
  const sortedTasks = [...classifiedTasks].sort(taskSort);

  if (blockingReviews.length) {
    return {
      action: 'получить и зафиксировать решение профильного специалиста по блокирующему замечанию',
      owner: blockingReviews[0]?.reviewer_role || (deal?.lawyer_needed ? 'lawyer' : 'manager'),
      due: earliestDue(sortedTasks.map((item) => ({ due_date: item.policy?.control_due_date }))),
      task_policy: null
    };
  }
  if (blockingRisks.length) {
    const risk = blockingRisks[0];
    return {
      action: 'уточнить условия устранения блокирующего риска и приложить подтверждение результата',
      owner: risk?.responsible_role || risk?.assigned_role || (deal?.lawyer_needed ? 'lawyer' : 'manager'),
      due: earliestDue(sortedTasks.map((item) => ({ due_date: item.policy?.control_due_date }))),
      task_policy: null
    };
  }
  if (missingDocuments.length) {
    const document = [...missingDocuments].sort((left, right) => {
      const leftDue = validDate(left?.due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const rightDue = validDate(right?.due_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return leftDue - rightDue;
    })[0];
    return {
      action: 'получить обязательный документ и передать его профильному специалисту на проверку',
      owner: document?.responsible_role || document?.assigned_role || 'spn',
      due: validDate(document?.due_date),
      task_policy: null
    };
  }
  if (sortedTasks.length) {
    const selected = sortedTasks[0];
    return {
      action: selected.policy.action_text,
      owner: selected.policy.owner_role,
      owner_label: selected.policy.owner_label,
      due: validDate(selected.policy.control_due_date),
      task_policy: selected.policy
    };
  }
  if (deal?.settlements_agreed !== true) {
    return { action: 'согласовать порядок расчётов с участниками и профильным специалистом', owner: 'spn', due: null, task_policy: null };
  }
  if (deal?.expenses_agreed !== true) {
    return { action: 'согласовать распределение расходов между сторонами', owner: 'spn', due: null, task_policy: null };
  }
  if (deal?.status === 'registered') {
    return { action: 'проконтролировать раскрытие расчётов, передачу объекта, акт и ключи', owner: 'spn', due: null, task_policy: null };
  }
  if (deal?.status === 'closed') {
    return { action: 'проверить закрытие связанных задач и необходимость постсделочного сопровождения', owner: 'manager', due: null, task_policy: null };
  }
  return { action: 'определить следующий обязательный шаг по текущему этапу', owner: 'spn', due: null, task_policy: null };
}

export function buildDealCardCrmHandoffModel(data, profile = null, nowValue = Date.now()) {
  const deal = data?.deal || {};
  const openTasks = items(data, 'tasks').filter(isOpenTask);
  const classifiedTasks = classifyOpenTasks(openTasks, nowValue);
  const missingDocuments = items(data, 'documents').filter(isOpenDocument);
  const blockingRisks = items(data, 'risks').filter(riskIsBlocking);
  const blockingReviews = items(data, 'reviews').filter(isBlockingReview);
  const unownedTasks = openTasks.filter((task) => !task?.assigned_to && !task?.assigned_role);
  const next = chooseNextAction(deal, classifiedTasks, missingDocuments, blockingRisks, blockingReviews);
  const deadline = formatDate(next.due) || 'срок требуется уточнить';
  const owner = next.owner_label || roleTitle(next.owner);

  const fields = [
    { key: 'stage', label: 'Текущий этап', value: stageTitle(deal?.status) },
    { key: 'result', label: 'Результат', value: resultText(deal, openTasks, missingDocuments, blockingRisks, blockingReviews) },
    { key: 'obstacle', label: 'Риск или препятствие', value: obstacleText(blockingRisks, blockingReviews, missingDocuments) },
    { key: 'agreement', label: 'Договорённость', value: agreementText(deal) },
    { key: 'missing', label: 'Не хватает', value: missingText(missingDocuments, unownedTasks) },
    { key: 'next', label: 'Следующее действие', value: `${owner}: ${next.action}; ${deadline}.` }
  ];

  return {
    fields,
    copy_text: fields.map((field) => `${field.label}: ${field.value}`).join('\n'),
    counts: {
      open_tasks: openTasks.length,
      missing_documents: missingDocuments.length,
      blocking_risks: blockingRisks.length,
      blocking_reviews: blockingReviews.length,
      unowned_tasks: unownedTasks.length,
      inferred_task_types: classifiedTasks.filter((item) => item.policy.task_type_source === 'inferred_from_source').length,
      inferred_task_deadlines: classifiedTasks.filter((item) => item.policy.deadline_source === 'inferred_sla').length
    },
    next_action: {
      owner_role: next.owner || null,
      owner_label: owner,
      deadline: formatDate(next.due) || null,
      deadline_known: Boolean(next.due),
      task_type: next.task_policy?.task_type || null,
      task_type_source: next.task_policy?.task_type_source || null,
      owner_source: next.task_policy?.owner_source || null,
      deadline_source: next.task_policy?.deadline_source || null,
      preview_only: true
    },
    role: profile?.role || data?.profile?.role || null,
    privacy: {
      includes_client_identifiers: false,
      source: 'already_loaded_process_state'
    }
  };
}
