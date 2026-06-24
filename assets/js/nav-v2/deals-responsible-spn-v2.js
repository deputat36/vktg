const DEALS_LOADED_EVENT = 'nav-v2:deals-loaded';
const VISIBLE_ROLES = new Set(['owner', 'admin', 'lawyer']);

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

  if (seller && buyer && seller === buyer) return `СПН: ${seller}`;
  if (seller && buyer) return `СПН продавца: ${seller} · СПН покупателя: ${buyer}`;
  if (seller) return `СПН продавца: ${seller}`;
  if (buyer) return `СПН покупателя: ${buyer}`;
  return 'СПН пока не назначен';
}

function renderResponsible(card, deal) {
  if (!card) return;
  const text = responsibleText(deal);
  const key = encodeURIComponent(text);
  const existing = card.querySelector('[data-responsible-spn]');
  if (existing?.dataset.responsibleKey === key) return;

  const html = `<div class="status" data-responsible-spn="true" data-responsible-key="${key}" style="margin:10px 0">
    <b>Подготовку ведёт:</b> ${esc(text)}
  </div>`;

  if (existing) {
    existing.outerHTML = html;
    return;
  }

  const head = card.querySelector('.deal-head');
  if (head) head.insertAdjacentHTML('afterend', html);
}

function apply() {
  if (!data || !VISIBLE_ROLES.has(data.profile?.role) || !Array.isArray(data.items)) return;
  data.items.forEach((deal) => {
    if (!deal?.id) return;
    renderResponsible(findDealCard(deal.id), deal);
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

function setData(next) {
  if (!next || !Array.isArray(next.items)) return;
  data = next;
  apply();
}

const app = document.getElementById('app') || document.body;
new MutationObserver(scheduleApply).observe(app, { childList: true, subtree: true });
window.addEventListener(DEALS_LOADED_EVENT, (event) => setData(event.detail));
if (window.navV2Deals) setData(window.navV2Deals);
