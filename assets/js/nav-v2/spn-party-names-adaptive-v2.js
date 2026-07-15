import {
  clientDirectIdentifierKeys,
  hasDirectClientIdentifiers,
  sanitizeClientDeal
} from './client-data-minimization-model-v2.js?v=20260715-01';

const DRAFT_KEY = 'nav_deal_draft_v2';
const CLEAN_RELOAD_KEY = 'nav_spn_minimized_draft_reload_v2';
const FORBIDDEN_KEYS = new Set(clientDirectIdentifierKeys());
let scheduled = false;
let observerStarted = false;

function readRawDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function sanitizeStoredDraft({ reload = false } = {}) {
  const current = readRawDraft();
  const changed = hasDirectClientIdentifiers(current);
  const sanitized = sanitizeClientDeal(current);
  localStorage.setItem(DRAFT_KEY, JSON.stringify(sanitized));

  if (changed && reload && !sessionStorage.getItem(CLEAN_RELOAD_KEY)) {
    sessionStorage.setItem(CLEAN_RELOAD_KEY, '1');
    location.reload();
    return true;
  }
  return changed;
}

function activeCard() {
  return document.querySelector('#app section.card:last-of-type') || document.querySelector('#app .card');
}

function activeHeading(card) {
  return card?.querySelector('h2')?.textContent?.trim() || '';
}

function removeIdentifierFields(root = document) {
  root.querySelectorAll('[data-field]').forEach((field) => {
    if (!FORBIDDEN_KEYS.has(field.dataset.field)) return;
    field.closest('.field')?.remove();
  });
  root.querySelectorAll('[data-party-names-block]').forEach((node) => node.remove());
}

function privacyNotice(kind) {
  const label = kind === 'buyer' ? 'покупателя' : kind === 'seller' ? 'продавца' : 'клиентов';
  return `<div class="status ok" data-client-minimization-notice="${kind}"><b>Персональные данные не нужны.</b> Не указывайте ФИО, телефон, паспортные данные и реквизиты ${label}. В Навигаторе фиксируются роли, факты, документы по статусам, риски и следующий шаг.</div>`;
}

function ensureNotice(card, kind) {
  if (!card || card.querySelector(`[data-client-minimization-notice="${kind}"]`)) return;
  const heading = card.querySelector('h2');
  if (heading) heading.insertAdjacentHTML('afterend', privacyNotice(kind));
}

function replaceLegacyHints(card) {
  card?.querySelectorAll('li, p, span').forEach((node) => {
    if (node.children.length) return;
    const text = node.textContent || '';
    if (text.includes('Укажите деньги, контакт или комментарий')) {
      node.textContent = text.replace('Укажите деньги, контакт или комментарий', 'Укажите источник денег или рабочий комментарий');
    }
    if (text.includes('состав и контакт')) node.textContent = text.replace('состав и контакт', 'состав и условия');
  });
}

function apply() {
  sanitizeStoredDraft();
  removeIdentifierFields();
  const card = activeCard();
  const heading = activeHeading(card);
  if (heading.startsWith('Продавец')) ensureNotice(card, 'seller');
  if (heading.startsWith('Покупатель')) ensureNotice(card, 'buyer');
  if (heading.startsWith('Итог')) ensureNotice(card, 'finish');
  replaceLegacyHints(document.getElementById('app'));
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    apply();
  });
}

function startObserver() {
  if (observerStarted) return;
  const host = document.getElementById('app');
  if (!host) return;
  observerStarted = true;
  new MutationObserver(schedule).observe(host, { childList: true, subtree: true });
}

sanitizeStoredDraft({ reload: true });
startObserver();
apply();
document.addEventListener('input', schedule, true);
document.addEventListener('change', schedule, true);
window.addEventListener('storage', schedule);
