const DRAFT_KEY = 'nav_deal_draft_v2';
const CONFIRMED_KEY = 'nav_spn_save_confirmed_at_v2';
const CONFIRMED_GAPS_KEY = 'nav_spn_save_confirmed_gaps_v2';
const SAVED_HANDOFF_KEY = 'nav_spn_saved_deal_handoff_v2';
const SAVE_RPC_PATH = '/rest/v1/rpc/nav_v2_save_wizard_result';

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function filled(value) {
  return String(value ?? '').trim().length > 0;
}

function arr(deal, key) {
  return Array.isArray(deal?.[key]) ? deal[key] : [];
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[char]));
}

function hasBuyer(deal) {
  if (deal.hasBuyer === true) return true;
  if (deal.hasBuyer === false) return false;
  return ['buyer', 'one_spn_both', 'both', 'partner_agency'].includes(deal.representation)
    || ['terms_discussed', 'urgent_deposit', 'deposit_exists', 'main_deal'].includes(deal.stage);
}

function needsDeposit(deal) {
  return deal.preparationMode === 'deposit'
    || ['urgent_deposit', 'deposit_exists'].includes(deal.stage)
    || (['terms_discussed', 'main_deal'].includes(deal.stage) && hasBuyer(deal));
}

function gap(text, step) {
  return { text, step };
}

function criticalGaps(deal) {
  const gaps = [];
  if (!filled(deal.preparationMode)) gaps.push(gap('не выбрано, что готовим', 'Что готовим'));
  if (!filled(deal.representation)) gaps.push(gap('не выбрано, кого сопровождаем', 'Сторона'));
  if (!filled(deal.stage)) gaps.push(gap('не указана стадия', 'Стадия'));
  if (!filled(deal.objectType)) gaps.push(gap('не выбран тип объекта', 'Объект'));
  if (!filled(deal.address) && deal.stage !== 'lead_only') gaps.push(gap('нет адреса или ориентира', 'Детали объекта'));
  if (hasBuyer(deal) && !arr(deal, 'payments').length && !filled(deal.moneyComment)) gaps.push(gap('непонятен источник денег покупателя', 'Деньги'));
  if (needsDeposit(deal) && deal.settlementsAgreed !== true) gaps.push(gap('расчеты не согласованы', 'Расчеты и расходы'));
  if (needsDeposit(deal) && deal.expensesAgreed !== true) gaps.push(gap('расходы не согласованы', 'Расчеты и расходы'));
  if (!filled(deal.clientNextStep)) gaps.push(gap('не указан ближайший шаг с клиентом', 'Итог'));
  return gaps;
}

function confirmationKey(deal, gaps) {
  return JSON.stringify({
    gaps: gaps.map((item) => item.text),
    preparationMode: deal.preparationMode || '',
    representation: deal.representation || '',
    stage: deal.stage || '',
    objectType: deal.objectType || '',
    address: String(deal.address || '').trim().toLowerCase(),
    payments: arr(deal, 'payments').slice().sort(),
    settlementsAgreed: deal.settlementsAgreed === true,
    expensesAgreed: deal.expensesAgreed === true,
    clientNextStep: String(deal.clientNextStep || '').trim().toLowerCase()
  });
}

function clearConfirmation() {
  sessionStorage.removeItem(CONFIRMED_KEY);
  sessionStorage.removeItem(CONFIRMED_GAPS_KEY);
}

function syncConfirmation(key, hasGaps) {
  const confirmedKey = sessionStorage.getItem(CONFIRMED_GAPS_KEY) || '';
  if (!hasGaps || (confirmedKey && confirmedKey !== key)) clearConfirmation();
}

function hasFreshConfirmation(key) {
  const value = Number(sessionStorage.getItem(CONFIRMED_KEY) || 0);
  const confirmedKey = sessionStorage.getItem(CONFIRMED_GAPS_KEY) || '';
  return value > 0 && Date.now() - value < 30000 && confirmedKey === key;
}

function markConfirmed(key) {
  sessionStorage.setItem(CONFIRMED_KEY, String(Date.now()));
  sessionStorage.setItem(CONFIRMED_GAPS_KEY, key);
}

function statusHost() {
  return document.getElementById('pageStatus');
}

function showWarning(gaps, key) {
  const host = statusHost();
  if (!host) return;
  if (host.dataset.saveGapKey === key) return;
  host.dataset.saveGapKey = key;
  host.className = 'status warn';
  host.innerHTML = `<b>Сохранение остановлено: есть важные пробелы.</b><ul style="margin:8px 0 0 18px;padding:0">${gaps.map((item) => `<li>${esc(item.text)} <span class="small">шаг: ${esc(item.step)}</span></li>`).join('')}</ul>`;
  host.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function saveButtonFromEvent(event) {
  return event.target?.closest?.('[data-action="save"], #saveDealBtn') || null;
}

function guardSave(event) {
  const button = saveButtonFromEvent(event);
  if (!button || button.disabled) return;

  const draft = readDraft();
  const gaps = criticalGaps(draft);
  const key = confirmationKey(draft, gaps);
  syncConfirmation(key, gaps.length > 0);
  if (!gaps.length || hasFreshConfirmation(key)) return;

  showWarning(gaps, key);
  const message = `Перед сохранением есть важные пробелы:\n\n${gaps.map((item, index) => `${index + 1}. ${item.text} (шаг: ${item.step})`).join('\n')}\n\nСохранить черновик в CRM всё равно?`;
  if (confirm(message)) {
    markConfirmed(key);
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function syncFromDraft() {
  const draft = readDraft();
  const gaps = criticalGaps(draft);
  const key = confirmationKey(draft, gaps);
  syncConfirmation(key, gaps.length > 0);
}

function requestUrl(input) {
  if (typeof input === 'string') return input;
  return String(input?.url || '');
}

function savedPayload(data) {
  const value = Array.isArray(data) ? data[0] : data;
  const dealId = String(value?.id || '').trim();
  if (!dealId) return null;
  return {
    deal_id: dealId,
    title: String(value?.title || '').trim(),
    next_action: String(value?.next_action || '').trim(),
    status: String(value?.status || '').trim(),
    risk_level: String(value?.risk_level || '').trim(),
    saved_at: Date.now()
  };
}

function rememberSavedDeal(data) {
  const payload = savedPayload(data);
  if (!payload) return;
  try { sessionStorage.setItem(SAVED_HANDOFF_KEY, JSON.stringify(payload)); } catch (_) {}
}

function observeSuccessfulWizardSave() {
  if (window.__navSpnSaveObserverV2) return;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = requestUrl(args[0]);
    if (response.ok && url.includes(SAVE_RPC_PATH)) {
      response.clone().json().then(rememberSavedDeal).catch(() => {});
    }
    return response;
  };
  window.__navSpnSaveObserverV2 = true;
}

document.addEventListener('input', syncFromDraft, true);
document.addEventListener('click', syncFromDraft, true);
document.addEventListener('pointerup', guardSave, true);
document.addEventListener('click', guardSave, true);
window.addEventListener('storage', syncFromDraft);

observeSuccessfulWizardSave();
syncFromDraft();
