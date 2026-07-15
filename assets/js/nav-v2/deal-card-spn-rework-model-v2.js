const OPEN_STATUSES = new Set(['open', 'in_progress']);
const RETURN_ROLES = new Set(['owner', 'admin', 'manager', 'lawyer']);
const SUBMIT_ROLES = new Set(['owner', 'admin', 'manager', 'spn']);
const CYCLE_EVENTS = new Set(['returned_to_spn_rework', 'spn_rework_submitted', 'status_changed']);

const CATEGORY_DEFINITIONS = [
  {
    id: 'parties',
    label: 'Данные сторон и объекта',
    route: 'overview',
    target: 'partySummaryV2',
    match: /сторон|продавц|покупател|фио|имя|объект|адрес|кадастр|площад/i
  },
  {
    id: 'documents',
    label: 'Документы',
    route: 'docs',
    target: '',
    match: /документ|выписк|справк|паспорт|свидетельств|договор|егрн/i
  },
  {
    id: 'settlements',
    label: 'Расчёты',
    route: 'overview',
    target: 'depositReadinessV2',
    match: /расч[её]т|деньг|аккредитив|ячейк|сбр|оплат/i
  },
  {
    id: 'expenses',
    label: 'Расходы',
    route: 'expenses',
    target: '',
    match: /расход|комисси|нотариус|госпошлин|справк.*оплат/i
  },
  {
    id: 'risks',
    label: 'Риски и стоп-факторы',
    route: 'risks',
    target: '',
    match: /риск|стоп[- ]?фактор|обременен|опек|дет|маткап|доверенн/i
  },
  {
    id: 'next_action',
    label: 'Следующий шаг',
    route: 'tasks',
    target: '',
    match: /следующ|ближайш.*шаг|что дальше|задач/i
  },
  {
    id: 'responsibility',
    label: 'Ответственные и срок',
    route: 'overview',
    target: 'dealResponsibilitySnapshotV2',
    match: /ответствен|владел|менеджер|юрист.*назнач|брокер.*назнач|спн.*назнач|срок/i
  },
  {
    id: 'other',
    label: 'Другое замечание',
    route: 'comments',
    target: '',
    match: /./
  }
];

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return text(value).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function time(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function roleLabel(role) {
  return ({
    owner: 'Владелец',
    admin: 'Администратор',
    manager: 'Менеджер',
    lawyer: 'Юрист',
    spn: 'СПН',
    broker: 'Брокер',
    viewer: 'Наблюдатель'
  })[normalize(role)] || text(role) || 'Ответственный не указан';
}

function currentRole(profile) {
  return normalize(profile?.role);
}

function sorted(items) {
  return [...items].sort((a, b) => time(b?.created_at) - time(a?.created_at));
}

function cycleEvents(data) {
  return sorted(list(data, 'events').filter((event) => CYCLE_EVENTS.has(event?.event_type)));
}

function findCycleEvent(data, type) {
  return cycleEvents(data).find((event) => event?.event_type === type) || null;
}

function commentIntentScore(comment, type) {
  const body = normalize(comment?.body);
  if (type === 'returned_to_spn_rework') {
    return /вернул|возвращен|что нужно исправить|что нужно доработать|причина возврата/.test(body) ? 30 : 0;
  }
  return /повторн|доработан|исправлен|исправлено|что исправлено/.test(body) ? 30 : 0;
}

function commentForEvent(data, event, type) {
  const comments = sorted(list(data, 'comments'));
  if (!event) return comments.find((comment) => commentIntentScore(comment, type) > 0) || null;
  const eventTime = time(event.created_at);
  const actorId = text(event.actor_id);
  return comments
    .map((comment) => {
      const distance = Math.abs(time(comment.created_at) - eventTime);
      const sameActor = actorId && actorId === text(comment.author_id);
      const near = distance <= 5 * 60 * 1000;
      const intent = commentIntentScore(comment, type);
      return { comment, score: (sameActor ? 60 : 0) + (near ? 40 : 0) + intent - Math.min(distance / 1000, 300) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.comment || null;
}

function explicitRole(body) {
  const match = text(body).match(/(?:карточку\s+вернул(?:а)?|вернул)\s*:\s*([^\.\n]+)/i);
  if (match) return text(match[1]);
  if (/^юрист\b/i.test(text(body))) return 'Юрист';
  if (/^менеджер\b/i.test(text(body))) return 'Менеджер';
  if (/^администратор\b/i.test(text(body))) return 'Администратор';
  if (/^владелец\b/i.test(text(body))) return 'Владелец';
  return '';
}

function actorLabel(event, comment, profile) {
  const fromBody = explicitRole(comment?.body);
  if (fromBody) return fromBody;
  if (text(event?.actor_id) && text(event.actor_id) === text(profile?.id)) {
    return text(profile?.full_name) || roleLabel(profile?.role);
  }
  return 'Не зафиксировано в карточке';
}

function returnReason(body) {
  const explicit = text(body).match(/причина\s+возврата\s*:\s*([^\n]+)/i);
  if (explicit) return text(explicit[1]);
  const first = text(body).split('\n').map(text).find(Boolean) || '';
  if (first && !/вернул|доработ/i.test(first)) return first;
  return 'Нужно исправить перечисленные замечания перед повторной проверкой.';
}

function snapshotReadiness(data) {
  const snapshot = data?.deal?.wizard_snapshot || {};
  return snapshot?.deal?.readiness_local || snapshot?.readiness_local || {};
}

function missingRequiredDocuments(data) {
  return list(data, 'documents').filter((doc) => doc?.is_required && !['received', 'checked'].includes(doc?.status));
}

function unresolvedRedRisks(data) {
  return list(data, 'risks').filter((risk) => risk?.level === 'red' && risk?.is_resolved !== true);
}

function missingResponsibility(deal) {
  const missing = [];
  if (!deal?.manager_id) missing.push('менеджер');
  if (!deal?.seller_spn_id && !deal?.buyer_spn_id) missing.push('СПН');
  if (deal?.lawyer_needed && !deal?.lawyer_id) missing.push('юрист');
  if (deal?.broker_needed && !deal?.broker_id) missing.push('брокер');
  return missing;
}

function partyGaps(deal) {
  const gaps = [];
  if (!text(deal?.seller_name)) gaps.push('имя продавца');
  if (!text(deal?.buyer_name)) gaps.push('имя покупателя');
  if (!text(deal?.address)) gaps.push('адрес объекта');
  if (!text(deal?.object_type)) gaps.push('тип объекта');
  return gaps;
}

function categoryState(category, data) {
  const deal = data?.deal || {};
  if (category === 'parties') return partyGaps(deal).length ? 'unresolved' : 'resolved';
  if (category === 'documents') return missingRequiredDocuments(data).length ? 'unresolved' : 'resolved';
  if (category === 'settlements') return deal.settlements_agreed === true ? 'resolved' : 'unresolved';
  if (category === 'expenses') return deal.expenses_agreed === true ? 'resolved' : 'unresolved';
  if (category === 'risks') return unresolvedRedRisks(data).length ? 'unresolved' : 'resolved';
  if (category === 'next_action') return text(deal.next_action) ? 'resolved' : 'unresolved';
  if (category === 'responsibility') return missingResponsibility(deal).length ? 'unresolved' : 'resolved';
  return 'unknown';
}

function categoryOf(line) {
  return CATEGORY_DEFINITIONS.find((definition) => definition.id !== 'other' && definition.match.test(line))
    || CATEGORY_DEFINITIONS.find((definition) => definition.id === 'other');
}

function cleanRemarkLine(line) {
  return text(line)
    .replace(/^\s*(?:\d+[.)]|[-–—•□])\s*/, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .trim();
}

function explicitRemarkLines(body) {
  const lines = text(body).split('\n').map((line) => line.trim()).filter(Boolean);
  const numbered = lines.filter((line) => /^\s*(?:\d+[.)]|[-–—•□])\s+/.test(line));
  if (numbered.length) return numbered.map(cleanRemarkLine).filter(Boolean).slice(0, 12);
  const markerIndex = lines.findIndex((line) => /что нужно (?:исправить|доработать)|что исправить|стоп-вопросы/i.test(line));
  if (markerIndex >= 0) {
    return lines.slice(markerIndex + 1)
      .filter((line) => !/после (?:исправления|доработки)|контрольные показатели|готовность/i.test(line))
      .map(cleanRemarkLine)
      .filter(Boolean)
      .slice(0, 12);
  }
  return [];
}

function detectedGapOptions(data) {
  const deal = data?.deal || {};
  const gaps = [];
  const parties = partyGaps(deal);
  const docs = missingRequiredDocuments(data);
  const risks = unresolvedRedRisks(data);
  const responsibility = missingResponsibility(deal);
  if (parties.length) gaps.push({ category: 'parties', detail: `Заполнить: ${parties.join(', ')}.` });
  if (docs.length) gaps.push({ category: 'documents', detail: `Обязательные документы не получены или не проверены: ${docs.length}.` });
  if (deal.settlements_agreed !== true) gaps.push({ category: 'settlements', detail: 'Зафиксировать согласованный порядок расчётов.' });
  if (deal.expenses_agreed !== true) gaps.push({ category: 'expenses', detail: 'Зафиксировать согласованные расходы сторон.' });
  if (risks.length) gaps.push({ category: 'risks', detail: `Разобрать открытые красные риски: ${risks.length}.` });
  if (!text(deal.next_action)) gaps.push({ category: 'next_action', detail: 'Указать следующий шаг сделки.' });
  if (responsibility.length) gaps.push({ category: 'responsibility', detail: `Назначить или подтвердить: ${responsibility.join(', ')}.` });
  return gaps;
}

function remark(category, detail, data, index, source) {
  const definition = CATEGORY_DEFINITIONS.find((item) => item.id === category) || CATEGORY_DEFINITIONS.at(-1);
  return {
    id: `${definition.id}-${index + 1}`,
    category: definition.id,
    title: definition.label,
    detail: text(detail) || definition.label,
    route: definition.route,
    target: definition.target,
    state: categoryState(definition.id, data),
    source
  };
}

function remarksForReturn(data, comment) {
  const lines = explicitRemarkLines(comment?.body);
  if (lines.length) return lines.map((line, index) => {
    const definition = categoryOf(line);
    return remark(definition.id, line, data, index, 'return_comment');
  });

  const readiness = snapshotReadiness(data);
  const saved = [
    ...(Array.isArray(readiness?.blockers) ? readiness.blockers : []),
    ...(Array.isArray(readiness?.missing) ? readiness.missing : [])
  ].map(text).filter(Boolean);
  if (saved.length) return saved.map((line, index) => {
    const definition = categoryOf(line);
    return remark(definition.id, line, data, index, 'saved_readiness');
  });

  const gaps = detectedGapOptions(data);
  if (gaps.length) return gaps.map((gap, index) => remark(gap.category, gap.detail, data, index, 'current_card'));
  return [remark('other', 'Откройте комментарии и уточните исходное замечание перед повторной отправкой.', data, 0, 'fallback')];
}

function optionDetail(category, data) {
  return detectedGapOptions(data).find((item) => item.category === category)?.detail
    || ({
      parties: 'Уточнить данные сторон или объекта.',
      documents: 'Получить, проверить или исправить документы.',
      settlements: 'Уточнить порядок расчётов.',
      expenses: 'Уточнить расходы сторон.',
      risks: 'Уточнить риск или стоп-фактор.',
      next_action: 'Зафиксировать следующий шаг, владельца и срок.',
      responsibility: 'Назначить или подтвердить ответственного и срок.',
      other: 'Описать другое конкретное замечание.'
    })[category];
}

function returnOptions(data) {
  const suggested = new Set(detectedGapOptions(data).map((item) => item.category));
  return CATEGORY_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    detail: optionDetail(definition.id, data),
    route: definition.route,
    target: definition.target,
    suggested: suggested.has(definition.id)
  }));
}

function lawyerTask(data) {
  return list(data, 'tasks')
    .filter((task) => OPEN_STATUSES.has(task?.status) && task?.assigned_role === 'lawyer')
    .sort((a, b) => {
      const aTime = time(a?.due_date) || Number.MAX_SAFE_INTEGER;
      const bTime = time(b?.due_date) || Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })[0] || null;
}

function submittedView(data, profile, submitEvent) {
  const deal = data?.deal || {};
  const submitComment = commentForEvent(data, submitEvent, 'spn_rework_submitted');
  const task = lawyerTask(data);
  const assigned = Boolean(deal.lawyer_id);
  return {
    submittedAt: submitEvent?.created_at || submitComment?.created_at || null,
    submittedBy: text(submitEvent?.actor_id) === text(profile?.id)
      ? (text(profile?.full_name) || roleLabel(profile?.role))
      : 'СПН',
    completionComment: text(submitComment?.body) || 'Комментарий о выполненных исправлениях не найден.',
    recipient: assigned ? 'Назначенному юристу' : 'В очередь юридической проверки',
    newStatus: 'Юрист',
    nextOwner: assigned ? 'Назначенный юрист' : 'Юрист — ожидает распределения',
    nextDueDate: task?.due_date || null,
    nextAction: 'Юрист сверит исправления с замечаниями и зафиксирует решение: продолжить сделку или вернуть конкретный пункт повторно.'
  };
}

export function buildSpnReworkModel(data, profile, nowValue = Date.now()) {
  const deal = data?.deal || {};
  const role = currentRole(profile || data?.profile || null);
  const events = cycleEvents(data);
  const latestCycle = events[0] || null;
  const returnEvent = findCycleEvent(data, 'returned_to_spn_rework');
  const submitEvent = findCycleEvent(data, 'spn_rework_submitted');
  const returnComment = commentForEvent(data, returnEvent, 'returned_to_spn_rework');

  if (deal.status === 'need_info') {
    const remarks = remarksForReturn(data, returnComment);
    const unresolvedCount = remarks.filter((item) => item.state === 'unresolved').length;
    return {
      visible: true,
      phase: 'fix',
      dealId: deal.id || null,
      role,
      canSubmit: SUBMIT_ROLES.has(role),
      readyToSubmit: unresolvedCount === 0,
      unresolvedCount,
      returnedBy: actorLabel(returnEvent, returnComment, profile || data?.profile || null),
      returnedAt: returnEvent?.created_at || returnComment?.created_at || null,
      reason: returnReason(returnComment?.body),
      returnComment: text(returnComment?.body),
      remarks,
      firstRoute: remarks.find((item) => item.state === 'unresolved') || remarks[0],
      isDemo: deal?.deal_summary?.demo === true || deal?.wizard_snapshot?.demo === true || text(deal?.title).startsWith('ДЕМО:')
    };
  }

  if (deal.status === 'need_lawyer' && latestCycle?.event_type === 'spn_rework_submitted' && submitEvent) {
    return {
      visible: true,
      phase: 'submitted',
      dealId: deal.id || null,
      role,
      isReviewer: ['owner', 'admin', 'manager', 'lawyer'].includes(role),
      ...submittedView(data, profile || data?.profile || null, submitEvent)
    };
  }

  if (RETURN_ROLES.has(role)) {
    return {
      visible: true,
      phase: 'return',
      dealId: deal.id || null,
      role,
      returner: roleLabel(role),
      options: returnOptions(data),
      isDemo: deal?.deal_summary?.demo === true || deal?.wizard_snapshot?.demo === true || text(deal?.title).startsWith('ДЕМО:'),
      generatedAt: new Date(nowValue).toISOString()
    };
  }

  return { visible: false, phase: 'none', dealId: deal.id || null, role };
}

export function buildSpnReworkReturnComment(model, selectedIds, customReason = '') {
  const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const options = (Array.isArray(model?.options) ? model.options : []).filter((option) => selected.has(option.id));
  const custom = text(customReason);
  const reason = custom || (options.length ? 'Нужно исправить отмеченные пункты перед повторной проверкой.' : 'Требуется уточнить замечания перед повторной проверкой.');
  const lines = [
    `Карточку вернул: ${text(model?.returner) || 'Ответственный'}.`,
    `Причина возврата: ${reason}`,
    '',
    'Что нужно исправить:'
  ];
  if (options.length) {
    options.forEach((option, index) => lines.push(`${index + 1}. ${option.label}. ${option.id === 'other' && custom ? custom : option.detail}`));
  } else {
    lines.push(`1. Другое замечание. ${reason}`);
  }
  lines.push('', 'После исправления сохраните изменения, перечислите результат и отправьте карточку на повторную проверку.');
  return lines.join('\n');
}
