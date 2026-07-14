import { buildWorkingDealSet } from './dashboard-priority-v2.js?v=20260714-02';

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isOverdueDeal(deal) {
  return number(deal?.overdue_tasks_count) > 0;
}

export function hasMissingResponsibility(deal) {
  const noSpn = !text(deal?.seller_spn) && !text(deal?.buyer_spn);
  const noManager = !text(deal?.manager);
  const noLawyer = Boolean(deal?.lawyer_needed) && !text(deal?.lawyer);
  const noBroker = Boolean(deal?.broker_needed) && !text(deal?.broker);
  return noSpn || noManager || noLawyer || noBroker;
}

export function needsWorkAttention(deal) {
  return deal?.status === 'need_info'
    || deal?.risk_level === 'red'
    || number(deal?.red_risks_count) > 0
    || isOverdueDeal(deal)
    || hasMissingResponsibility(deal);
}

export function dealMatchesWorkMode(deal, mode) {
  if (mode === 'work') return true;
  if (mode === 'attention') return needsWorkAttention(deal);
  if (mode === 'overdue') return isOverdueDeal(deal);
  if (mode === 'unassigned') return hasMissingResponsibility(deal);
  if (mode === 'deposit') return number(deal?.readiness_deposit) >= 80;
  if (mode === 'docs') return number(deal?.missing_documents_count) > 0;
  if (mode === 'red') return deal?.risk_level === 'red' || number(deal?.red_risks_count) > 0;
  if (mode === 'rework') return deal?.status === 'need_info';
  if (mode === 'lawyer') {
    return Boolean(deal?.lawyer_needed)
      && (deal?.status === 'need_lawyer'
        || deal?.status === 'need_documents'
        || !text(deal?.lawyer)
        || deal?.risk_level === 'red'
        || number(deal?.red_risks_count) > 0
        || number(deal?.missing_documents_count) > 0);
  }
  if (mode === 'broker') {
    return Boolean(deal?.broker_needed)
      && (deal?.status === 'need_broker'
        || deal?.status === 'need_documents'
        || !text(deal?.broker)
        || number(deal?.open_tasks_count) > 0);
  }
  if (mode === 'deal') return number(deal?.readiness_deal) >= 80;
  return true;
}

const MODE_LABELS = {
  work: 'Рабочие',
  attention: 'Требуют внимания',
  overdue: 'Просрочено',
  unassigned: 'Без ответственного',
  deposit: 'Готовы к задатку',
  docs: 'Не хватает документов',
  red: 'Красные риски',
  lawyer: 'Юридическая очередь',
  broker: 'Финансовая очередь'
};

function modeKeysForRole(role) {
  if (role === 'lawyer') return ['lawyer', 'red', 'overdue', 'docs'];
  if (role === 'broker') return ['broker', 'overdue', 'unassigned', 'deposit'];
  if (role === 'spn') return ['work', 'attention', 'overdue', 'docs', 'deposit'];
  if (role === 'viewer') return ['work', 'attention', 'overdue', 'deposit'];
  return ['work', 'attention', 'overdue', 'unassigned', 'deposit'];
}

export function buildDealsWorkspace(deals, role) {
  const workingSet = buildWorkingDealSet(deals);
  const counts = {};

  for (const key of Object.keys(MODE_LABELS)) {
    counts[key] = workingSet.canonicalDeals.filter((deal) => dealMatchesWorkMode(deal, key)).length;
  }

  const quickModes = modeKeysForRole(role).map((key) => ({
    key,
    label: MODE_LABELS[key],
    count: counts[key] || 0
  }));

  return {
    ...workingSet,
    counts,
    quickModes
  };
}
