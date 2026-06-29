const DEALS_LOADED_EVENT = 'nav-v2:deals-loaded';
const VISIBLE_ROLES = new Set(['owner', 'admin', 'manager', 'lawyer', 'broker', 'spn']);
const SEARCH_FALLBACK_ATTR = 'data-responsible-spn-search';
const SEARCH_FALLBACK_KEY_ATTR = 'data-responsible-spn-search-key';

let data = null;
let applyQueued = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function clean(value) {
  return String(value || '').trim();
}

function samePerson(left, right) {
  return clean(left).toLocaleLowerCase('ru-RU') === clean(right).toLocaleLowerCase('ru-RU');
}

function cssEscape(value) {
  const text = String(value || '');
  if (window.CSS?.escape) return CSS.escape(text);
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function findDealCard(dealId) {
  const link = document.querySelector(`a[href*="id=${cssEscape(dealId)}"]`);
  return link?.closest?.('article.deal-card') || null;
}

function responsibleText(deal) {
  const seller = clean(deal?.seller_spn);
  const buyer = clean(deal?.buyer_spn);
  const ownName = clean(data?.profile?.full_name);

  if (data?.profile?.role === 'spn' && ownName) {
    const ownSeller = seller && samePerson(seller, ownName);
    const ownBuyer = buyer && samePerson(buyer, ownName);
    if (ownSeller && ownBuyer) return 'Вы ведёте продавца и покупателя';
    if (ownSeller && buyer) return `Вы ведёте продавца · покупателя ведёт: ${buyer}`;
    if (ownBuyer && seller) return `Продавца ведёт: ${seller} · вы ведёте покупателя`;
    if (ownSeller) return 'Вы ведёте продавца';
    if (ownBuyer) return 'Вы ведёте покупателя';
  }

  if (seller && buyer && seller === buyer) return `СПН: ${seller}`;
  if (seller && buyer) return `СПН продавца: ${seller} · СПН покупателя: ${buyer}`;
  if (seller) return `СПН продавца: ${seller}`;
  if (buyer) return `СПН покупателя: ${buyer}`;
  return 'СПН пока не назначен';
}

function searchText(deal) {
  return [deal?.seller_spn, deal?.buyer_spn, responsibleText(deal), deal?.manager, deal?.lawyer, deal?.broker]
    .join(' ')
    .toLocaleLowerCase('ru-RU');
}

function dealTitle(deal) {
  return clean(deal?.display_title) || clean(deal?.title) || clean(deal?.address) || `Сделка ${String(deal?.id || '').slice(0, 8).toUpperCase()}`;
}

function renderResponsible(card, deal) {
  if (!card) return;
  const text = responsibleText(deal);
  const key = encodeURIComponent(text);
  const existing = card.querySelector('[data-responsible-spn]');
  if (existing?.dataset.responsibleKey === key) return;

  const heading = data?.profile?.role === 'spn' ? 'Ваша зона ответственности:' : 'Подготовку ведёт:';
  const html = `<div class="status" data-responsible-spn="true" data-responsible-key="${key}" style="margin:10px 0">
    <b>${heading}</b> ${esc(text)}
  </div>`;

  if (existing) {
    existing.outerHTML = html;
    return;
  }

  const head = card.querySelector('.deal-head');
  if (head) head.insertAdjacentHTML('afterend', html);
}

function removeSearchFallback() {
  document.querySelector(`[${SEARCH_FALLBACK_ATTR}]`)?.remove();
}

function renderSearchFallback() {
  if (!data || !Array.isArray(data.items)) return removeSearchFallback();
  const query = clean(document.getElementById('dealSearch')?.value);
  if (!query) return removeSearchFallback();

  const queryLower = query.toLocaleLowerCase('ru-RU');
  const matches = data.items
    .filter((deal) => deal?.id && searchText(deal).includes(queryLower) && !findDealCard(deal.id))
    .slice(0, 8);

  if (!matches.length) return removeSearchFallback();

  const key = `${queryLower}|${matches.map((deal) => deal.id).join(',')}`;
  let host = document.querySelector(`[${SEARCH_FALLBACK_ATTR}]`);
  if (!host) {
    host = document.createElement('div');
    host.className = 'status warn';
    host.setAttribute(SEARCH_FALLBACK_ATTR, 'true');
    const list = document.querySelector('.deal-list');
    if (!list) return;
    list.insertAdjacentElement('beforebegin', host);
  }

  if (host.getAttribute(SEARCH_FALLBACK_KEY_ATTR) === key) return;
  host.setAttribute(SEARCH_FALLBACK_KEY_ATTR, key);
  host.innerHTML = `<b>Найдены совпадения по СПН:</b> ${matches.map((deal) => `<a href="./deal-card-v2.html?id=${encodeURIComponent(deal.id)}">${esc(dealTitle(deal))}</a>`).join(' · ')}`;
}

function apply() {
  if (!data || !VISIBLE_ROLES.has(data.profile?.role) || !Array.isArray(data.items)) return;
  data.items.forEach((deal) => {
    if (!deal?.id) return;
    renderResponsible(findDealCard(deal.id), deal);
  });
  renderSearchFallback();
}

function scheduleApply() {
  if (applyQueued) return;
  applyQueued = true;
  requestAnimationFrame(() => {
    applyQueued = false;
    apply();
  });
}

function setData(next) {
  if (!next || !Array.isArray(next.items)) return;
  data = next;
  apply();
}

const app = document.getElementById('app') || document.body;
new MutationObserver(scheduleApply).observe(app, { childList: true, subtree: true });
window.addEventListener('input', (event) => {
  if (event.target?.id === 'dealSearch') scheduleApply();
});
window.addEventListener(DEALS_LOADED_EVENT, (event) => setData(event.detail));
if (window.navV2Deals) setData(window.navV2Deals);
