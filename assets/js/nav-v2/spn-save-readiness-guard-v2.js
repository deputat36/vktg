const DRAFT_KEY = 'nav_deal_draft_v2';
const CONFIRMED_KEY = 'nav_spn_save_confirmed_at_v2';

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function filled(value) {
  return String(value ?? '').trim().length > 0;
}

function arr(deal, key) {
  return Array.isArray(deal?.[key]) ? deal[key] : [];
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

function criticalGaps(deal) {
  const gaps = [];
  if (!filled(deal.preparationMode)) gaps.push('не выбрано, что готовим');
  if (!filled(deal.representation)) gaps.push('не выбрано, кого сопровождаем');
  if (!filled(deal.stage)) gaps.push('не указана стадия');
  if (!filled(deal.objectType)) gaps.push('не выбран тип объекта');
  if (!filled(deal.address) && deal.stage !== 'lead_only') gaps.push('нет адреса или ориентира');
  if (hasBuyer(deal) && !arr(deal, 'payments').length && !filled(deal.moneyComment)) gaps.push('непонятен источник денег покупателя');
  if (needsDeposit(deal) && deal.settlementsAgreed !== true) gaps.push('расчеты не согласованы');
  if (needsDeposit(deal) && deal.expensesAgreed !== true) gaps.push('расходы не согласованы');
  if (!filled(deal.clientNextStep)) gaps.push('не указан ближайший шаг с клиентом');
  return gaps;
}

function hasFreshConfirmation() {
  const value = Number(sessionStorage.getItem(CONFIRMED_KEY) || 0);
  return value > 0 && Date.now() - value < 30000;
}

function markConfirmed() {
  sessionStorage.setItem(CONFIRMED_KEY, String(Date.now()));
}

function statusHost() {
  return document.getElementById('pageStatus');
}

function showWarning(gaps) {
  const host = statusHost();
  if (!host) return;
  host.className = 'status warn';
  host.innerHTML = `Перед сохранением есть пробелы: ${gaps.map((item) => `• ${item}`).join(' ')}`;
}

function saveButtonFromEvent(event) {
  return event.target?.closest?.('[data-action="save"]') || null;
}

function guardSave(event) {
  const button = saveButtonFromEvent(event);
  if (!button || button.disabled) return;
  if (hasFreshConfirmation()) return;

  const gaps = criticalGaps(readDraft());
  if (!gaps.length) return;

  showWarning(gaps);
  const message = `Перед сохранением есть важные пробелы:\n\n${gaps.map((item, index) => `${index + 1}. ${item}`).join('\n')}\n\nСохранить черновик в CRM всё равно?`;
  if (confirm(message)) {
    markConfirmed();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

document.addEventListener('pointerup', guardSave, true);
document.addEventListener('click', guardSave, true);
