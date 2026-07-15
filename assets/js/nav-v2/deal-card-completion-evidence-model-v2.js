import { buildDealActionFocus } from './deal-card-action-focus-model-v2.js?v=20260714-01';

const COMPLETION_EVENTS = new Set([
  'task_status_changed',
  'document_workflow_updated',
  'document_status_changed',
  'risk_resolved',
  'status_changed'
]);
const DEFAULT_MAX_AGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEAL_STATUS_ORDER = new Map([
  ['draft', 0],
  ['need_info', 0],
  ['need_lawyer', 1],
  ['need_broker', 1],
  ['need_documents', 2],
  ['ready_for_deposit', 3],
  ['deposit_done', 4],
  ['preparing_deal', 5],
  ['ready_for_deal', 6],
  ['registration', 7],
  ['registered', 8],
  ['closed', 9]
]);

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function timestamp(value) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function roleLabel(role) {
  return ({
    owner: 'Владелец',
    admin: 'Администратор',
    manager: 'Менеджер',
    spn: 'СПН',
    lawyer: 'Юрист',
    broker: 'Брокер',
    viewer: 'Наблюдатель'
  })[text(role).toLowerCase()] || '';
}

function dealStatusLabel(status) {
  return ({
    draft: 'Черновик',
    need_info: 'Нужно дозаполнить',
    need_lawyer: 'Проверка юриста',
    need_broker: 'Проверка брокера',
    need_documents: 'Нужны документы',
    ready_for_deposit: 'Готова к задатку',
    deposit_done: 'Задаток внесён',
    preparing_deal: 'Подготовка к сделке',
    ready_for_deal: 'Готова к сделке',
    registration: 'На регистрации',
    registered: 'Зарегистрирована',
    closed: 'Закрыта'
  })[text(status)] || text(status) || 'Статус не указан';
}

function eventData(event) {
  return event?.event_data && typeof event.event_data === 'object' ? event.event_data : {};
}

function entityForEvent(data, event) {
  const payload = eventData(event);
  if (event?.event_type === 'task_status_changed') {
    return list(data, 'tasks').find((task) => text(task?.id) === text(payload.task_id)) || null;
  }
  if (event?.event_type === 'document_workflow_updated' || event?.event_type === 'document_status_changed') {
    return list(data, 'documents').find((doc) => text(doc?.id) === text(payload.document_id)) || null;
  }
  if (event?.event_type === 'risk_resolved') {
    return list(data, 'risks').find((risk) => text(risk?.id) === text(payload.risk_id)) || null;
  }
  if (event?.event_type === 'status_changed') return data?.deal || null;
  return null;
}

function isForwardDealStatus(payload, deal) {
  const current = text(deal?.status);
  const previous = text(payload.old_status);
  const next = text(payload.status);
  if (!previous || !next || current !== next) return false;
  const previousOrder = DEAL_STATUS_ORDER.get(previous);
  const nextOrder = DEAL_STATUS_ORDER.get(next);
  return Number.isFinite(previousOrder) && Number.isFinite(nextOrder) && nextOrder > previousOrder;
}

function completionKind(data, event, entity) {
  const payload = eventData(event);
  if (event?.event_type === 'task_status_changed') {
    return payload.status === 'done' && entity?.status === 'done' ? 'task' : '';
  }
  if (event?.event_type === 'document_workflow_updated' || event?.event_type === 'document_status_changed') {
    const noOp = text(payload.old_status) && text(payload.old_status) === text(payload.status);
    return payload.status === 'checked' && entity?.status === 'checked' && !noOp ? 'document' : '';
  }
  if (event?.event_type === 'risk_resolved') {
    return payload.is_resolved === true && entity?.is_resolved === true ? 'risk' : '';
  }
  if (event?.event_type === 'status_changed') {
    return isForwardDealStatus(payload, entity) ? 'deal_status' : '';
  }
  return '';
}

function actorLabel(data, profile, event, entity, kind) {
  const actorId = text(event?.actor_id);
  if (!actorId) return { label: 'Автор не зафиксирован сервером', known: false };
  if (actorId === text(profile?.id)) {
    return { label: text(profile?.full_name) || roleLabel(profile?.role) || 'Вы', known: true };
  }

  const deal = data?.deal || {};
  const dealRoles = [
    [deal.manager_id, 'Менеджер'],
    [deal.lawyer_id, 'Юрист'],
    [deal.broker_id, 'Брокер'],
    [deal.seller_spn_id, 'СПН продавца'],
    [deal.buyer_spn_id, 'СПН покупателя'],
    [deal.created_by, 'СПН, создавший карточку']
  ];
  const dealRole = dealRoles.find(([id]) => actorId === text(id));
  if (dealRole) return { label: dealRole[1], known: true };

  const actorFields = kind === 'task'
    ? [entity?.completed_by, entity?.assigned_to]
    : kind === 'document'
      ? [entity?.checked_by, entity?.assigned_to]
      : kind === 'risk'
        ? [entity?.resolved_by]
        : [];
  if (actorFields.some((id) => actorId === text(id))) {
    const entityRole = roleLabel(entity?.assigned_role || entity?.responsible_role);
    return { label: entityRole || 'Ответственный сотрудник', known: true };
  }

  return { label: 'Сотрудник — имя не передано карточке', known: false };
}

function completionCopy(kind, event, entity) {
  const payload = eventData(event);
  const title = text(entity?.title) || text(payload.title) || text(payload.risk_title);
  if (kind === 'task') return {
    title: `Задача «${title || 'Без названия'}» выполнена`,
    state: 'Готово',
    serverFact: 'История сделки содержит событие завершения, а текущий статус задачи на сервере — «Готово».',
    entityId: text(entity?.id)
  };
  if (kind === 'document') return {
    title: `Документ «${title || 'Без названия'}» проверен`,
    state: 'Проверен',
    serverFact: 'История сделки содержит событие проверки, а текущий статус документа на сервере — «Проверен».',
    entityId: text(entity?.id)
  };
  if (kind === 'risk') return {
    title: `Риск «${title || 'Без названия'}» устранён`,
    state: 'Устранён',
    serverFact: 'История сделки содержит событие устранения, а текущий риск на сервере отмечен как закрытый.',
    entityId: text(entity?.id)
  };
  const state = dealStatusLabel(payload.status);
  return {
    title: `Сделка перешла в статус «${state}»`,
    state,
    serverFact: 'История сделки содержит переход вперёд, а текущий серверный статус совпадает с подтверждённым этапом.',
    entityId: text(entity?.id)
  };
}

function dueDate(focus) {
  return focus?.dueDate || null;
}

function nextAction(focus) {
  return {
    title: text(focus?.title) || 'Определить следующий шаг сделки',
    responsible: text(focus?.responsible) || 'Ответственный не назначен',
    dueDate: dueDate(focus),
    deadlineState: text(focus?.deadlineState) || 'none',
    source: text(focus?.source) || 'deal',
    primaryTab: text(focus?.primaryTab) || 'overview',
    taskId: text(focus?.taskId),
    resultCriteria: text(focus?.resultCriteria)
  };
}

function candidateEvents(data) {
  return [...list(data, 'events')]
    .filter((event) => COMPLETION_EVENTS.has(event?.event_type))
    .sort((a, b) => timestamp(b?.created_at) - timestamp(a?.created_at));
}

export function buildDealCompletionEvidence(data, profile, options = {}) {
  const currentProfile = profile || data?.profile || null;
  const now = timestamp(options.now || new Date()) || Date.now();
  const maxAgeDays = Number.isFinite(Number(options.maxAgeDays)) ? Number(options.maxAgeDays) : DEFAULT_MAX_AGE_DAYS;
  const maxAgeMs = Math.max(0, maxAgeDays) * DAY_MS;

  for (const event of candidateEvents(data)) {
    const at = timestamp(event?.created_at);
    if (!at || now - at > maxAgeMs || at - now > DAY_MS) continue;
    const entity = entityForEvent(data, event);
    if (!entity) continue;
    const kind = completionKind(data, event, entity);
    if (!kind) continue;

    const copy = completionCopy(kind, event, entity);
    const actor = actorLabel(data, currentProfile, event, entity, kind);
    const focus = buildDealActionFocus(data, currentProfile, now);
    return {
      visible: true,
      kind,
      title: copy.title,
      state: copy.state,
      actor: actor.label,
      actorKnown: actor.known,
      at: event.created_at,
      serverFact: copy.serverFact,
      serverEventId: text(event.id),
      serverEventType: text(event.event_type),
      entityId: copy.entityId,
      readOnly: currentProfile?.role === 'viewer',
      nextAction: nextAction(focus)
    };
  }

  return { visible: false, nextAction: null };
}
