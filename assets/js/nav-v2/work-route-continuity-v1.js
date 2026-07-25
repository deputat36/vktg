const VALID_TABS = new Set(['overview', 'tasks', 'risks', 'docs']);
const DEALS_LOADED_EVENT = 'nav-v2:deals-loaded';
let scheduled = false;

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalized(value) {
  return text(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

function hasMissingResponsibility(deal) {
  const noSpn = !text(deal?.seller_spn) && !text(deal?.buyer_spn);
  const noManager = !text(deal?.manager);
  const noLawyer = Boolean(deal?.lawyer_needed) && !text(deal?.lawyer);
  const noBroker = Boolean(deal?.broker_needed) && !text(deal?.broker);
  return noSpn || noManager || noLawyer || noBroker;
}

export function workTargetFromDeal(deal, role = '', filter = '') {
  const mode = normalized(filter);
  if (mode === 'overdue') return 'tasks';
  if (mode === 'red') return 'risks';
  if (mode === 'docs') return 'docs';

  const currentRole = normalized(role);
  const openTasks = number(deal?.open_tasks_count);
  const overdueTasks = number(deal?.overdue_tasks_count);
  const redRisks = number(deal?.red_risks_count) || (deal?.risk_level === 'red' ? 1 : 0);
  const missingDocuments = number(deal?.missing_documents_count);

  if (['owner', 'admin', 'manager'].includes(currentRole) && hasMissingResponsibility(deal)) return 'overview';
  if (currentRole === 'lawyer' && redRisks) return 'risks';
  if (['spn', 'broker'].includes(currentRole) && (openTasks || overdueTasks)) return 'tasks';
  if (redRisks) return 'risks';
  if (openTasks || overdueTasks) return 'tasks';
  if (missingDocuments) return 'docs';
  if (currentRole === 'lawyer') return 'risks';
  return 'overview';
}

export function workTargetFromAction(actionTitle, reasons = []) {
  const action = normalized(actionTitle);
  const reasonText = normalized(Array.isArray(reasons) ? reasons.join(' ') : reasons);

  if (action.includes('назначить ответственного')) return 'overview';
  if (action.includes('стоп-фактор') || action.includes('блокирующий риск')) return 'risks';
  if (action.includes('документ')) return 'docs';
  if (action.includes('просроч') || action.includes('финансирован') || action.includes('следующ')) return 'tasks';

  if (reasonText.includes('красн') || reasonText.includes('стоп-фактор')) return 'risks';
  if (reasonText.includes('просроч')) return 'tasks';
  if (reasonText.includes('документ')) return 'docs';
  return 'overview';
}

export function workRouteLabel(tab) {
  return ({
    tasks: 'Открыть задачи',
    risks: 'Открыть риски',
    docs: 'Открыть документы',
    overview: 'Открыть карточку'
  })[VALID_TABS.has(tab) ? tab : 'overview'];
}

export function hrefWithWorkTab(href, tab) {
  try {
    const url = new URL(href, location.href);
    if (!url.pathname.endsWith('/deal-card-v2.html') && !url.pathname.endsWith('deal-card-v2.html')) return href;
    const target = VALID_TABS.has(tab) ? tab : 'overview';
    url.hash = target === 'overview' ? '' : target;
    const fileName = url.pathname.split('/').pop();
    return `${fileName ? './' + fileName : url.pathname}${url.search}${url.hash}`;
  } catch (_) {
    return href;
  }
}

function numericMetric(card, label) {
  const expected = normalized(label);
  for (const item of card?.querySelectorAll('.deal-meta > div') || []) {
    const name = normalized(item.querySelector('.small')?.textContent);
    if (name !== expected) continue;
    return number(item.querySelector('b')?.textContent);
  }
  return 0;
}

function targetFromRenderedDealCard(card) {
  if (numericMetric(card, 'Просрочено') > 0) return 'tasks';
  if (card?.querySelector('.deal-head .pill.red')) return 'risks';
  if (numericMetric(card, 'Документы') > 0) return 'docs';
  return 'overview';
}

function applyLink(link, tab, updateLabel = false) {
  if (!(link instanceof HTMLAnchorElement)) return;
  const target = VALID_TABS.has(tab) ? tab : 'overview';
  const nextHref = hrefWithWorkTab(link.getAttribute('href') || link.href, target);
  if (nextHref && link.getAttribute('href') !== nextHref) link.setAttribute('href', nextHref);
  if (link.dataset.workRouteTab !== target) link.dataset.workRouteTab = target;
  if (updateLabel) {
    const label = workRouteLabel(target);
    if (text(link.textContent) !== label) link.textContent = label;
  }
}

function enhanceDashboard() {
  document.querySelectorAll('.role-home-priority-card').forEach((card) => {
    const action = card.querySelector('.role-home-priority-head .small')?.textContent || '';
    const reasons = [...card.querySelectorAll('.role-home-reason')].map((item) => item.textContent || '');
    const tab = workTargetFromAction(action, reasons);
    applyLink(card.querySelector('a[href*="deal-card-v2.html"]'), tab, true);
  });

  document.querySelectorAll('.role-home-recent a.deal-card[href*="deal-card-v2.html"]').forEach((link) => {
    applyLink(link, targetFromRenderedDealCard(link), false);
  });
}

function currentDealsState() {
  const detail = window.navV2Deals || {};
  const items = Array.isArray(detail.items) ? detail.items : [];
  const byId = new Map(items.map((deal) => [text(deal?.id), deal]));
  return {
    byId,
    role: detail.profile?.role || '',
    filter: new URLSearchParams(location.search).get('filter') || detail.filter || ''
  };
}

function dealIdFromLink(link) {
  try {
    return new URL(link.href, location.href).searchParams.get('id') || '';
  } catch (_) {
    return '';
  }
}

function enhanceDealsList() {
  const state = currentDealsState();
  if (!state.byId.size) return;

  document.querySelectorAll('.deals-work-card a.mobile-first-screen-primary-action[href*="deal-card-v2.html"]').forEach((link) => {
    const deal = state.byId.get(dealIdFromLink(link));
    if (!deal) return;
    const tab = workTargetFromDeal(deal, state.role, state.filter);
    applyLink(link, tab, true);
  });
}

export function applyWorkRouteContinuity() {
  enhanceDashboard();
  enhanceDealsList();
}

function scheduleApply() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    applyWorkRouteContinuity();
  });
}

window.addEventListener(DEALS_LOADED_EVENT, scheduleApply);
new MutationObserver(scheduleApply).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
applyWorkRouteContinuity();
