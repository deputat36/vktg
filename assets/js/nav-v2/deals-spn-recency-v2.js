import './deals-handoff-summary-v2.js?v=20260625-1035';

const DEALS_LOADED_EVENT = 'nav-v2:deals-loaded';
const WARN_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const CRITICAL_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const FINAL_STATUSES = new Set(['closed', 'cancelled', 'registered']);

let data = null;
let applyQueued = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[char]));
}

function findDealCard(dealId) {
  const id = String(dealId || '');
  const encoded = encodeURIComponent(id);
  const links = Array.from(document.querySelectorAll('a[href*="deal-card-v2.html"]'));
  const link = links.find((item) => item.href.includes(encoded) || item.href.includes(id));
  return link?.closest?.('article.deal-card') || null;
}

function updatedTime(deal) {
  const value = Date.parse(deal?.last_activity_at || deal?.updated_at || '');
  return Number.isFinite(value) ? value : null;
}

function ageText(time) {
  if (!time) return 'дата неизвестна';
  const elapsed = Math.max(0, Date.now() - time);
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 2) return 'только что';
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн. назад`;
}

function recencyState(deal) {
  const time = updatedTime(deal);
  const age = ageText(time);
  if (!time) {
    return {
      cls: 'warn',
      key: 'unknown',
      text: 'Дата активности неизвестна. Перед следующим действием перепроверьте условия с клиентом.'
    };
  }

  const elapsed = Math.max(0, Date.now() - time);
  if (FINAL_STATUSES.has(deal?.status)) {
    return { cls: '', key: `final-${time}`, text: `Последняя активность: ${age}.` };
  }
  if (elapsed >= CRITICAL_AFTER_MS) {
    return {
      cls: 'error',
      key: `critical-${time}`,
      text: `В карточке не было активности ${age}. До задатка или сделки заново подтвердите цену, участников, документы, расчёты и расходы.`
    };
  }
  if (elapsed >= WARN_AFTER_MS) {
    return {
      cls: 'warn',
      key: `warn-${time}`,
      text: `Последняя активность была ${age}. Перед звонком клиенту проверьте, не изменились ли условия и ближайший шаг.`
    };
  }
  return { cls: '', key: `fresh-${time}`, text: `Последняя активность: ${age}.` };
}

function renderRecency(card, deal) {
  if (!card) return;
  const state = recencyState(deal);
  const existing = card.querySelector('[data-spn-recency]');
  if (existing?.dataset.recencyKey === state.key) return;

  const html = `<div class="status ${state.cls}" data-spn-recency="true" data-recency-key="${esc(state.key)}" role="status" style="margin:10px 0">
    <b>Актуальность:</b> ${esc(state.text)}
  </div>`;

  if (existing) {
    existing.outerHTML = html;
    return;
  }

  const responsibility = card.querySelector('[data-responsible-spn]') || card.querySelector('[data-handoff-summary]');
  if (responsibility) responsibility.insertAdjacentHTML('afterend', html);
  else card.querySelector('.deal-head')?.insertAdjacentHTML('afterend', html);
}

function apply() {
  if (data?.profile?.role !== 'spn' || !Array.isArray(data.items)) return;
  data.items.forEach((deal) => {
    if (deal?.id) renderRecency(findDealCard(deal.id), deal);
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
