const EVENT = 'nav-v2:deals-loaded';
const ROLES = new Set(['owner', 'admin', 'lawyer', 'spn']);
let state = null;
let queued = false;

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

function applyOne(deal) {
  const card = findCard(deal.id);
  if (!card) return;
  let box = card.querySelector('[data-handoff-summary]');
  const key = clientsLine(deal) + '|' + lawyerLine(deal);
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
  muted.textContent = lawyerLine(deal);
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

window.addEventListener(EVENT, (event) => { state = event.detail; apply(); });
new MutationObserver(schedule).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
if (window.navV2Deals) { state = window.navV2Deals; apply(); }
