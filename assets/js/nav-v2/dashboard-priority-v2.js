const CLOSED_STATUSES = new Set(['completed', 'closed', 'cancelled', 'canceled', 'archived']);

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value) {
  return text(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function dateValue(value, fallback = Number.MAX_SAFE_INTEGER) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isDashboardDemoDeal(deal) {
  return normalize(deal?.title).startsWith('демо ');
}

export function dashboardDuplicateKey(deal) {
  return [
    normalize(deal?.address),
    normalize(deal?.display_title || deal?.title),
    normalize(deal?.object_type),
    normalize(deal?.buyer_phone),
    normalize(deal?.seller_phone),
    normalize(deal?.buyer_name),
    normalize(deal?.seller_name),
    normalize(deal?.next_action),
    number(deal?.price_total)
  ].join('|');
}

function roleBonus(deal, role) {
  const red = number(deal?.red_risks_count);
  const overdue = number(deal?.overdue_tasks_count);
  const missing = number(deal?.missing_documents_count);
  const noManager = !text(deal?.manager);
  const noLawyer = Boolean(deal?.lawyer_needed) && !text(deal?.lawyer);
  const noBroker = Boolean(deal?.broker_needed) && !text(deal?.broker);
  const noSpn = !text(deal?.seller_spn) && !text(deal?.buyer_spn);

  if (role === 'lawyer') return (deal?.lawyer_needed ? 30 : 0) + (noLawyer ? 25 : 0) + red * 15 + missing * 3;
  if (role === 'broker') return (deal?.broker_needed ? 30 : 0) + (noBroker ? 25 : 0) + (deal?.has_mortgage ? 10 : 0) + overdue * 3;
  if (role === 'spn') return red * 20 + overdue * 5 + missing * 2;
  if (role === 'owner' || role === 'admin' || role === 'manager') {
    return (noManager ? 24 : 0) + (noLawyer ? 18 : 0) + (noBroker ? 12 : 0) + (noSpn ? 20 : 0);
  }
  return 0;
}

function priorityScore(deal, role) {
  const red = number(deal?.red_risks_count);
  const yellow = number(deal?.yellow_risks_count);
  const overdue = number(deal?.overdue_tasks_count);
  const openTasks = number(deal?.open_tasks_count);
  const missing = number(deal?.missing_documents_count);
  const dueAt = dateValue(deal?.next_task_due_date);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const dueSoon = dueAt <= today.getTime() ? 14 : 0;
  const missingNextAction = text(deal?.next_action) ? 0 : 20;

  return red * 55
    + overdue * 13
    + yellow * 6
    + Math.min(missing, 20) * 2
    + Math.min(openTasks, 12)
    + dueSoon
    + missingNextAction
    + roleBonus(deal, role);
}

function reasonList(deal, role) {
  const reasons = [];
  const red = number(deal?.red_risks_count);
  const overdue = number(deal?.overdue_tasks_count);
  const missing = number(deal?.missing_documents_count);
  const noManager = !text(deal?.manager);
  const noLawyer = Boolean(deal?.lawyer_needed) && !text(deal?.lawyer);
  const noBroker = Boolean(deal?.broker_needed) && !text(deal?.broker);
  const noSpn = !text(deal?.seller_spn) && !text(deal?.buyer_spn);

  if (red) reasons.push({ type: 'danger', text: `Красных рисков: ${red}` });
  if (overdue) reasons.push({ type: 'danger', text: `Просроченных задач: ${overdue}` });
  if ((role === 'owner' || role === 'admin' || role === 'manager') && noManager) {
    reasons.push({ type: 'warning', text: 'Не назначен менеджер' });
  }
  if ((role === 'owner' || role === 'admin' || role === 'manager' || role === 'lawyer') && noLawyer) {
    reasons.push({ type: 'warning', text: 'Нужен юрист' });
  }
  if ((role === 'owner' || role === 'admin' || role === 'manager' || role === 'broker') && noBroker) {
    reasons.push({ type: 'warning', text: 'Нужен брокер' });
  }
  if ((role === 'owner' || role === 'admin' || role === 'manager') && noSpn) {
    reasons.push({ type: 'warning', text: 'Не назначен СПН' });
  }
  if (missing) reasons.push({ type: 'neutral', text: `Не хватает документов: ${missing}` });
  if (!text(deal?.next_action)) reasons.push({ type: 'warning', text: 'Не указан следующий шаг' });

  if (!reasons.length) {
    reasons.push({
      type: 'positive',
      text: number(deal?.readiness_deposit) >= 80 ? 'Можно приблизить задаток' : 'Нужно проверить следующий шаг'
    });
  }

  return reasons.slice(0, 4);
}

function actionTitle(deal, role) {
  const red = number(deal?.red_risks_count);
  const overdue = number(deal?.overdue_tasks_count);

  if (role === 'viewer') return 'Посмотреть причину';
  if (role === 'lawyer') return red ? 'Проверить стоп-фактор' : 'Проверить документы';
  if (role === 'broker') return 'Проверить финансирование';
  if (role === 'spn') return overdue ? 'Снять просрочку' : 'Выполнить следующий шаг';
  if (!text(deal?.manager)) return 'Назначить ответственного';
  if (red) return 'Разобрать блокирующий риск';
  if (overdue) return 'Снять просрочку';
  return 'Проверить следующий шаг';
}

function chooseCanonical(group) {
  return [...group].sort((a, b) => {
    const created = dateValue(a?.created_at) - dateValue(b?.created_at);
    if (created !== 0) return created;
    return text(a?.id).localeCompare(text(b?.id));
  })[0];
}

export function buildWorkingDealSet(deals) {
  const source = Array.isArray(deals) ? deals : [];
  const active = source.filter((deal) => !CLOSED_STATUSES.has(normalize(deal?.status)));
  const real = active.filter((deal) => !isDashboardDemoDeal(deal));
  const groups = new Map();

  for (const deal of real) {
    const key = dashboardDuplicateKey(deal);
    const list = groups.get(key) || [];
    list.push(deal);
    groups.set(key, list);
  }

  const canonicalDeals = [];
  let hiddenDuplicateCount = 0;
  for (const group of groups.values()) {
    canonicalDeals.push(chooseCanonical(group));
    hiddenDuplicateCount += Math.max(0, group.length - 1);
  }

  return {
    source,
    activeDeals: active,
    realDeals: real,
    canonicalDeals,
    hiddenDemoCount: active.length - real.length,
    hiddenDuplicateCount,
    visibleRawCount: source.length,
    workingDealCount: canonicalDeals.length
  };
}

export function buildDashboardFocus(deals, role, limit = 3) {
  const workingSet = buildWorkingDealSet(deals);
  const { canonicalDeals } = workingSet;

  const ranked = canonicalDeals
    .map((deal) => ({
      deal,
      score: priorityScore(deal, role),
      reasons: reasonList(deal, role),
      actionTitle: actionTitle(deal, role)
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const activity = dateValue(b.deal?.last_activity_at, 0) - dateValue(a.deal?.last_activity_at, 0);
      if (activity !== 0) return activity;
      return text(a.deal?.id).localeCompare(text(b.deal?.id));
    });

  const totals = canonicalDeals.reduce((result, deal) => {
    result.redRisks += number(deal?.red_risks_count);
    result.overdueTasks += number(deal?.overdue_tasks_count);
    result.missingDocuments += number(deal?.missing_documents_count);
    if (number(deal?.readiness_deposit) >= 80) result.readyDeposit += 1;
    return result;
  }, {
    redRisks: 0,
    overdueTasks: 0,
    missingDocuments: 0,
    readyDeposit: 0
  });

  const recentDeals = [...canonicalDeals]
    .sort((a, b) => dateValue(b?.last_activity_at, 0) - dateValue(a?.last_activity_at, 0))
    .slice(0, 6);

  return {
    ...workingSet,
    items: ranked.slice(0, Math.max(1, number(limit) || 3)),
    recentDeals,
    totals
  };
}
