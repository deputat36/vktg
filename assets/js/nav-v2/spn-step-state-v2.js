const DRAFT_KEY = 'nav_deal_draft_v2';

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch (_) { return {}; }
}

function arr(value) { return Array.isArray(value) ? value : []; }
function filled(value) { return String(value ?? '').trim().length > 0; }
function moneyFilled(value) { return Number(String(value || '').replace(',', '.')) > 0; }

function stepStates(d) {
  return [
    { done: filled(d.preparationMode), warn: true },
    { done: filled(d.representation), warn: true },
    { done: filled(d.objectType) && filled(d.address) && moneyFilled(d.priceTotal), warn: true },
    { done: arr(d.flags).length > 0 || filled(d.sellerPhone) || filled(d.buyerPhone), warn: true },
    { done: arr(d.basis).length > 0, warn: true },
    { done: arr(d.payments).length > 0, warn: true },
    { done: arr(d.settlements).length > 0 && d.settlementsAgreed === true, warn: d.settlementsAgreed === false },
    { done: d.expensesAgreed === true, warn: d.expensesAgreed === false },
    { done: filled(d.spnFinalComment) && filled(d.clientNextStep), warn: true }
  ];
}

function applyStepStates() {
  const draft = readDraft();
  const states = stepStates(draft);
  document.querySelectorAll('.step-pill').forEach((button, index) => {
    const state = states[index];
    if (!state || button.querySelector('.step-state')) return;
    const tag = document.createElement('span');
    tag.className = 'step-state pill ' + (state.done ? 'green' : state.warn ? 'yellow' : 'blue');
    tag.textContent = state.done ? 'готово' : 'заполнить';
    tag.style.marginTop = '6px';
    button.appendChild(tag);
  });
}

new MutationObserver(applyStepStates).observe(document.body, { childList: true, subtree: true });
applyStepStates();
