import { rpc } from './supabase-v2.js';

const EVENT = 'nav-v2:deals-loaded';
const ROLES = new Set(['owner', 'admin', 'lawyer', 'spn']);
let state = null;
let queued = false;
let scoreLoading = false;
let scoreKey = '';
let scores = new Map();

function clean(value) {
  return String(value || '').trim();
}

function same(left, right) {
  return clean(left).toLowerCase() === clean(right).toLowerCase();
}

function findCard(id) {
  const links = Array.from(document.querySelectorAll('a[href*="deal-card-v2.html"]'));
  const link = links.find((item) => item.href.includes(encodeURIComponent(id)) || item.href.includes(id));
  return link ? link.closest('article.deal-card') : null;
}

function clientsLine(deal) {
  const seller = clean(deal && deal.seller_spn);
  const buyer = clean(deal && deal.buyer_spn);
  const profile = state && state.profile ? state.profile : {};
  const own = clean(profile.full_name);
  if (profile.role === 'spn' && own) {
    const sellerOwn = seller && same(seller, own);
    const buyerOwn = buyer && same(buyer, own);
    if (sellerOwn && buyerOwn) return 'Вы ведёте продавца и покупателя.';
    if (sellerOwn) return buyer ? 'Вы ведёте продавца. Покупателя ведёт: ' + buyer + '.' : 'Вы ведёте продавца.';
    if (buyerOwn) return seller ? 'Продавца ведёт: ' + seller + '. Вы ведёте покупателя.' : 'Вы ведёте покупателя.';
  }
  if (seller && buyer && seller === buyer) return seller + ' ведёт продавца и покупателя.';
  if (seller && buyer) return 'Продавца ведёт: ' + seller + '. Покупателя ведёт: ' + buyer + '.';
  if (seller) return 'Продавца ведёт: ' + seller + '.';
  if (buyer) return 'Покупателя ведёт: ' + buyer + '.';
  return 'СПН по клиентам пока не назначен.';
}

function lawyerLine(deal) {
  const name = clean(deal && deal.lawyer);
  if (name) return 'Юрист: ' + name + '.';
  if (deal && (deal.lawyer_needed || deal.status === 'need_lawyer')) return 'Юрист нужен для рисков и договоров.';
  return 'Юрист подключается при рисках или договоре.';
}

function localHandoffGaps(deal) {
  const gaps = [];
  if (!clean(deal && deal.seller_name)) gaps.push('ФИО продавца');
  if (!clean(deal && deal.seller_phone)) gaps.push('телефон продавца');
  if (!clean(deal && deal.buyer_name)) gaps.push('ФИО покупателя');
  if (!clean(deal && deal.buyer_phone)) gaps.push('телефон покупателя');
  if (!clean(deal && deal.object_type)) gaps.push('тип объекта');
  if (!clean(deal && deal.address)) gaps.push('адрес');
  if (Number(deal && deal.price_total || 0) <= 0) gaps.push('цена');
  if ((deal && deal.settlements_agreed) !== true) gaps.push('расчёты');
  if ((deal && deal.expenses_agreed) !== true) gaps.push('расходы');
  return gaps;
}

function serverScore(deal) {
  return scores.get(String(deal && deal.id || '')) || null;
}

function readinessLine(deal) {
  const server = serverScore(deal);
  const gaps = localHandoffGaps(deal);
  if (server) {
    const count = Number(server.handoff_gap_count || 0);
    const score = Number(server.handoff_readiness_score || 0);
    if (!count) return 'Передача юристу: базовые данные заполнены, готовность 100%.';
    const shown = gaps.length ? gaps.slice(0, 4).join(', ') : 'откройте карточку для деталей';
    const tail = gaps.length > 4 ? ' и ещё ' + (gaps.length - 4) : '';
    return 'Перед юристом дозаполнить: ' + shown + tail + '. Готовность: ' + score + '%, пробелов: ' + count + '.';
  }
  if (!gaps.length) return 'Передача юристу: базовые данные заполнены.';
  const shown = gaps.slice(0, 4).join(', ');
  const tail = gaps.length > 4 ? ' и ещё ' + (gaps.length - 4) : '';
  return 'Перед юристом дозаполнить: ' + shown + tail + '.';
}

async function loadScores() {
  if (!state || scoreLoading || !Array.isArray(state.items)) return;
  const ids = state.items.map((deal) => deal && deal.id).filter(Boolean).slice(0, 100);
  const key = ids.join('|');
  if (!ids.length || key === scoreKey) return;
  scoreLoading = true;
  try {
    const data = await rpc('nav_v2_get_handoff_scores', { p_deal_ids: ids }, 12000);
    scores = new Map((Array.isArray(data && data.items) ? data.items : []).map((item) => [String(item.deal_id), item]));
    scoreKey = key;
    apply();
  } catch (_) {
    // Если серверная оценка недоступна, остаётся локальный fallback по полям списка.
  } finally {
    scoreLoading = false;
  }
}

function applyOne(deal) {
  const card = findCard(deal.id);
  if (!card) return;
  let box = card.querySelector('[data-handoff-summary]');
  const key = clientsLine(deal) + '|' + lawyerLine(deal) + '|' + readinessLine(deal);
  if (box && box.dataset.key === key) return;
  if (!box) {
    box = document.createElement('div');
    box.className = 'status';
    box.dataset.handoffSummary = 'true';
    box.style.margin = '10px 0';
    const place = card.querySelector('[data-responsible-spn]') || card.querySelector('.deal-head');
    if (place) place.after(box);
    else card.prepend(box);
  }
  box.dataset.key = key;
  box.innerHTML = '';
  const b = document.createElement('b');
  b.textContent = 'Клиенты / юрист: ';
  box.appendChild(b);
  box.appendChild(document.createTextNode(clientsLine(deal)));
  box.appendChild(document.createElement('br'));
  const muted = document.createElement('span');
  muted.className = 'muted';
  muted.textContent = lawyerLine(deal) + ' ' + readinessLine(deal);
  box.appendChild(muted);
}

function apply() {
  if (!state || !ROLES.has(state.profile && state.profile.role) || !Array.isArray(state.items)) return;
  state.items.forEach((deal) => { if (deal && deal.id) applyOne(deal); });
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; apply(); });
}

function setState(next) {
  state = next;
  scores = new Map();
  scoreKey = '';
  apply();
  loadScores();
}

window.addEventListener(EVENT, (event) => { if (event.detail) setState(event.detail); });
new MutationObserver(schedule).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
if (window.navV2Deals) setState(window.navV2Deals);
