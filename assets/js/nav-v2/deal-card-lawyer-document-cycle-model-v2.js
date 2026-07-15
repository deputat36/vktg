const OPEN_STATUSES = new Set(['needed', 'missing', 'requested', 'received', 'problem']);
const DOCUMENT_EVENTS = new Set(['document_workflow_updated', 'document_status_changed']);

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function bool(value) {
  return value === true || value === 'true';
}

function timestamp(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function day(value) {
  return text(value).slice(0, 10);
}

function statusLabel(status) {
  return ({
    needed: 'Нужен',
    missing: 'Не получен',
    requested: 'Запрошен',
    received: 'Получен',
    checked: 'Проверен',
    problem: 'Проблема'
  })[status] || text(status) || 'Нужен';
}

function sideLabel(side) {
  return ({
    seller: 'Продавец',
    buyer: 'Покупатель',
    both: 'Обе стороны',
    object: 'Объект',
    deal: 'Сделка',
    bank: 'Банк',
    lawyer: 'Юрист',
    company: 'Компания',
    other_agency: 'Партнёр',
    external_party: 'Внешняя сторона'
  })[side] || text(side) || 'Сторона не указана';
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
  })[role] || text(role) || 'Ответственный не назначен';
}

function participantName(data, userId) {
  if (!text(userId)) return '';
  const participant = list(data, 'participants').find((item) => text(item?.user_id) === text(userId));
  return text(participant?.display_name)
    || text(participant?.full_name)
    || text(participant?.email)
    || '';
}

function ownerLabel(data, doc) {
  const person = participantName(data, doc?.assigned_to);
  const role = roleLabel(doc?.responsible_role);
  return person ? `${person} · ${role}` : role;
}

function whyNeeded(doc) {
  return text(doc?.description)
    || text(doc?.source_hint)
    || (doc?.required_for_deposit
      ? 'Нужен для безопасной подготовки задатка.'
      : doc?.required_for_deal
        ? 'Нужен до основной сделки.'
        : 'Нужен для юридической проверки сделки.');
}

function blockingLabel(doc) {
  if (doc?.required_for_deposit && doc?.required_for_deal) return 'Блокирует задаток и сделку';
  if (doc?.required_for_deposit) return 'Блокирует задаток';
  if (doc?.required_for_deal) return 'Блокирует сделку';
  return 'Не отмечен как блокирующий';
}

function dueState(doc, today) {
  if (doc?.status === 'checked') return 'closed';
  const due = day(doc?.due_date);
  if (!due) return 'none';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return 'future';
}

function canTarget(doc, target) {
  if (target === 'received') return bool(doc?.can_mark_received);
  if (target === 'checked') return bool(doc?.can_mark_checked);
  if (target === 'problem') return bool(doc?.can_mark_problem);
  return doc?.can_change_status !== false;
}

function action(target, label, requiresNote = false) {
  return { target, label, requiresNote };
}

function actionsFor(doc) {
  const status = doc?.status || 'needed';
  const candidates = {
    needed: [action('requested', 'Отметить как запрошенный'), action('problem', 'Зафиксировать проблему', true)],
    missing: [action('requested', 'Запросить документ'), action('problem', 'Зафиксировать проблему', true)],
    requested: [action('received', 'Отметить получение'), action('problem', 'Зафиксировать проблему', true)],
    received: [action('checked', 'Проверить и подтвердить'), action('problem', 'Есть проблема', true)],
    problem: [action('requested', 'Вернуть на исправление'), action('received', 'Исправленный документ получен')],
    checked: []
  }[status] || [];
  return candidates.filter((item) => canTarget(doc, item.target));
}

function nextAction(doc, actions) {
  if (doc?.status === 'checked') return 'Документ проверен. Перейдите к следующему открытому документу.';
  if (actions.length) return actions[0].label;
  return `Передайте действие ответственному: ${roleLabel(doc?.responsible_role)}.`;
}

function priority(doc, today) {
  if (doc?.status === 'problem') return 0;
  if (doc?.status === 'received') return 10;
  if (doc?.status === 'requested' && dueState(doc, today) === 'overdue') return 20;
  if (doc?.status === 'requested') return 30;
  if (doc?.required_for_deposit && OPEN_STATUSES.has(doc?.status)) return 40;
  if (doc?.required_for_deal && OPEN_STATUSES.has(doc?.status)) return 50;
  if (OPEN_STATUSES.has(doc?.status)) return 60;
  return 100;
}

function normalizedDocument(data, doc, today) {
  const actions = actionsFor(doc);
  return {
    id: text(doc?.id),
    title: text(doc?.title) || 'Документ без названия',
    side: sideLabel(doc?.side),
    why: whyNeeded(doc),
    blocking: blockingLabel(doc),
    blockingTone: doc?.required_for_deposit || doc?.required_for_deal ? 'red' : 'blue',
    owner: ownerLabel(data, doc),
    dueDate: day(doc?.due_date) || null,
    dueState: dueState(doc, today),
    status: text(doc?.status) || 'needed',
    statusLabel: statusLabel(doc?.status),
    lastChangedAt: doc?.last_status_changed_at || doc?.checked_at || doc?.requested_at || doc?.updated_at || doc?.created_at || null,
    note: text(doc?.problem_note) || text(doc?.status_note),
    actions,
    nextAction: nextAction(doc, actions),
    priority: priority(doc, today),
    isOpen: OPEN_STATUSES.has(doc?.status)
  };
}

function eventDocumentId(event) {
  return text(event?.event_data?.document_id || event?.document_id);
}

function latestCompletion(data, documents) {
  const events = [...list(data, 'events')]
    .filter((event) => DOCUMENT_EVENTS.has(event?.event_type) && eventDocumentId(event))
    .sort((a, b) => timestamp(b?.created_at) - timestamp(a?.created_at));
  const event = events[0];
  if (!event) return null;
  const doc = documents.find((item) => item.id === eventDocumentId(event));
  if (!doc) return null;
  const status = text(event?.event_data?.status) || doc.status;
  return {
    documentId: doc.id,
    title: doc.title,
    status,
    statusLabel: statusLabel(status),
    at: event?.created_at || doc.lastChangedAt,
    next: doc.status === 'checked'
      ? 'Результат подтверждён. Система выбрала следующий открытый документ.'
      : doc.nextAction
  };
}

export function buildLawyerDocumentCycle(data, profile, options = {}) {
  const currentProfile = profile || data?.profile || null;
  const role = text(currentProfile?.role).toLowerCase();
  if (role !== 'lawyer') return { visible: false, role, documents: [] };

  const now = options.now ? new Date(options.now) : new Date();
  const today = Number.isNaN(now.getTime()) ? day(new Date().toISOString()) : day(now.toISOString());
  const documents = list(data, 'documents')
    .map((doc) => normalizedDocument(data, doc, today))
    .sort((a, b) => a.priority - b.priority
      || (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31')
      || a.title.localeCompare(b.title, 'ru'));
  const selected = documents.find((doc) => doc.id === text(options.selectedId));
  const focus = selected || documents.find((doc) => doc.isOpen) || documents[0] || null;
  const counts = documents.reduce((result, doc) => {
    result.total += 1;
    result[doc.status] = (result[doc.status] || 0) + 1;
    if (doc.dueState === 'overdue') result.overdue += 1;
    if (doc.blockingTone === 'red' && doc.isOpen) result.blocking += 1;
    return result;
  }, { total: 0, overdue: 0, blocking: 0, needed: 0, missing: 0, requested: 0, received: 0, checked: 0, problem: 0 });

  return {
    visible: true,
    role,
    dealId: text(data?.deal?.id),
    isDemo: data?.deal?.deal_summary?.demo === true
      || data?.deal?.wizard_snapshot?.demo === true
      || text(data?.deal?.title).startsWith('ДЕМО:'),
    documents,
    focus,
    counts,
    complete: documents.length > 0 && documents.every((doc) => doc.status === 'checked'),
    completion: latestCompletion(data, documents)
  };
}
