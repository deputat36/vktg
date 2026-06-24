import { rpc, esc } from './supabase-v2.js';

const DEALS_LOADED_EVENT = 'nav-v2:deals-loaded';

let dealsById = new Map();
let profile = null;
let loaded = false;
let applyQueued = false;
let reloadTimer = null;
let loadSeq = 0;

function number(value) {
  return Number(value || 0);
}

function dateText(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ru-RU');
}

function isRedRisk(deal) {
  return deal?.risk_level === 'red' || number(deal?.red_risks_count) > 0;
}

function isRework(deal) {
  return deal?.status === 'need_info';
}

function titleFor(deal) {
  return String(deal?.display_title || '').trim();
}

function taskDeadlineItem(deal) {
  const overdue = number(deal?.overdue_tasks_count);
  const open = number(deal?.open_tasks_count);
  const due = dateText(deal?.next_task_due_date);

  if (overdue > 0) return `Закрыть просроченные задачи: ${overdue}. Ближайший срок: ${due || 'уточнить в карточке'}.`;
  if (open > 0 && !due) return `Назначить сроки открытым задачам: без даты остаётся ${open}.`;
  if (open > 0 && due) return `Проверить ближайший срок задач: ${due}. Открыто задач: ${open}.`;
  return '';
}

function priorityItems(deal) {
  const items = [];

  if (isRework(deal)) {
    items.push('Закрыть доработку: открыть карточку, исправить замечания и отправить на повторную проверку.');
  }

  const deadlineItem = taskDeadlineItem(deal);
  if (deadlineItem) items.push(deadlineItem);

  if (number(deal?.missing_documents_count) > 0) {
    items.push(`Собрать обязательные документы: не хватает ${number(deal.missing_documents_count)}.`);
  }

  if (!deal?.settlements_agreed) {
    items.push('Зафиксировать порядок расчетов, чтобы не тормозить задаток и сделку.');
  }

  if (!deal?.expenses_agreed) {
    items.push('Согласовать расходы сторон и плательщиков.');
  }

  if (deal?.lawyer_needed && (isRedRisk(deal) || deal?.has_children)) {
    items.push('Передать юристу с коротким комментарием по рискам и недостающим данным.');
  }

  if (deal?.broker_needed && number(deal?.open_tasks_count) > 0) {
    items.push('Проверить задачи брокера и закрыть зависшие вопросы.');
  }

  if (!items.length && deal?.next_action) items.push(deal.next_action);
  return items.slice(0, 3);
}

function cssEscape(value) {
  const text = String(value || '');
  if (window.CSS?.escape) return CSS.escape(text);
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function findDealArticle(dealId) {
  const link = document.querySelector(`a[href*="id=${cssEscape(dealId)}"]`);
  return link?.closest?.('article.deal-card') || null;
}

function updateTitle(article, deal) {
  const readableTitle = titleFor(deal);
  const title = article?.querySelector?.('.deal-title');
  if (!title || !readableTitle) return;

  const demo = title.querySelector('.pill.blue')?.outerHTML || '';
  const titleKey = `${demo}|${readableTitle}`;
  if (title.dataset.spnTitleKey === titleKey) return;

  title.innerHTML = `${demo}${demo ? ' ' : ''}${esc(readableTitle)}`;
  title.dataset.spnTitleKey = titleKey;
}

function hintKey(items) {
  return encodeURIComponent(items.join('\u001f'));
}

function renderHints(article, deal) {
  if (!article) return;
  const items = priorityItems(deal);
  const existing = article.querySelector('[data-spn-priority-hints]');

  if (!items.length) {
    if (existing) existing.remove();
    return;
  }

  const key = hintKey(items);
  if (existing?.dataset.priorityKey === key) return;

  const html = `<div class="status warn" data-spn-priority-hints="true" data-priority-key="${key}" style="margin:10px 0">
    <b>Первым делом СПН:</b>
    <ul style="margin:6px 0 0 18px;padding:0">${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
  </div>`;

  if (existing) {
    existing.outerHTML = html;
    return;
  }

  const nextAction = [...article.querySelectorAll('p')].find((node) => node.textContent.includes('Следующий шаг'));
  if (nextAction) nextAction.insertAdjacentHTML('beforebegin', html);
  else article.insertAdjacentHTML('beforeend', html);
}

function apply() {
  if (!loaded || profile?.role !== 'spn') return;
  dealsById.forEach((deal, dealId) => {
    const article = findDealArticle(dealId);
    if (!article) return;
    updateTitle(article, deal);
    renderHints(article, deal);
  });
}

function scheduleApply() {
  if (applyQueued) return;
  applyQueued = true;
  requestAnimationFrame(() => {
    applyQueued = false;
    apply();
  });
}

function setLoadedData(data) {
  if (!data || !Array.isArray(data.items)) return false;
  profile = data.profile || null;
  dealsById = new Map(data.items.filter((deal) => deal?.id).map((deal) => [deal.id, deal]));
  loaded = true;
  apply();
  return true;
}

async function loadData() {
  const seq = ++loadSeq;
  try {
    const data = await rpc('nav_v2_get_deals_list', { p_limit: 80 }, 12000);
    if (seq !== loadSeq) return;
    setLoadedData(data);
  } catch (_) {
    if (seq !== loadSeq) return;
    loaded = false;
  }
}

function clearReload() {
  window.clearTimeout(reloadTimer);
  reloadTimer = null;
}

function queueReload(delay = 0) {
  clearReload();
  reloadTimer = window.setTimeout(loadData, delay);
}

function usePublishedDeals() {
  return setLoadedData(window.navV2Deals);
}

const app = document.getElementById('app') || document.body;
new MutationObserver(scheduleApply).observe(app, { childList: true, subtree: true });

window.addEventListener(DEALS_LOADED_EVENT, (event) => {
  clearReload();
  setLoadedData(event.detail);
});

document.addEventListener('click', (event) => {
  if (event.target?.closest?.('#reloadDeals')) queueReload(1800);
});

if (!usePublishedDeals()) queueReload(1200);
window.addEventListener('hashchange', scheduleApply);
