import { rpc, esc } from './supabase-v2.js';

let dealsById = new Map();
let profile = null;
let loaded = false;
let queued = false;

function number(value) {
  return Number(value || 0);
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

function priorityItems(deal) {
  const items = [];

  if (isRework(deal)) {
    items.push('Закрыть доработку: открыть карточку, исправить замечания и отправить на повторную проверку.');
  }

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

function findDealArticle(dealId) {
  const link = document.querySelector(`a[href*="id=${CSS.escape(dealId)}"]`);
  return link?.closest?.('article.deal-card') || null;
}

function updateTitle(article, deal) {
  const readableTitle = titleFor(deal);
  const title = article?.querySelector?.('.deal-title');
  if (!title || !readableTitle) return;
  const demo = title.querySelector('.pill.blue')?.outerHTML || '';
  title.innerHTML = `${demo}${demo ? ' ' : ''}${esc(readableTitle)}`;
}

function renderHints(article, deal) {
  if (!article) return;
  const items = priorityItems(deal);
  const existing = article.querySelector('[data-spn-priority-hints]');

  if (!items.length) {
    existing?.remove();
    return;
  }

  const html = `<div class="status warn" data-spn-priority-hints="true" style="margin:10px 0">
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

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    apply();
  });
}

async function loadData() {
  try {
    const data = await rpc('nav_v2_get_deals_list', { p_limit: 80 }, 12000);
    profile = data.profile || null;
    dealsById = new Map((data.items || []).map((deal) => [deal.id, deal]));
    loaded = true;
    apply();
  } catch (_) {
    loaded = false;
  }
}

const app = document.getElementById('app') || document.body;
new MutationObserver(schedule).observe(app, { childList: true, subtree: true });

loadData();
window.addEventListener('hashchange', schedule);
