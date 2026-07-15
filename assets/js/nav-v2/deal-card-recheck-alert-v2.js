import { applyDealCardActionFocus } from './deal-card-action-focus-v2.js?v=20260714-12';
import { applyDealCardSpnRework } from './deal-card-spn-rework-v2.js?v=20260715-01';
import { applyDealCardBazaHints } from './deal-card-baza-hints-v2.js?v=20260711-03';
import { applyDealCardSpnHandoff } from './deal-card-spn-handoff-v2.js?v=20260711-04';
import { applyDealResponsibilitySnapshot } from './deal-responsibility-snapshot-v2.js?v=20260711-05';
import { applyDealCardDocumentWorkflow } from './deal-card-doc-workflow-v2.js?v=20260711-06';
import { applyDealCardTaskDueDate } from './deal-card-task-due-date-v2.js?v=20260711-07';
import { applyDealCardExpenseLabels } from './expense-labels-v2.js?v=20260711-08';
import { applyDealCardReadableValues } from './readable-card-values-v2.js?v=20260711-09';
import { applyDealCardRiskResolution } from './deal-card-risk-resolution-v2.js?v=20260712-10';
import { applySpnSaveConfirmation } from './deal-card-spn-save-confirmation-v2.js?v=20260713-11';

let cardData = null;
let profileData = null;
let rerenderHookBound = false;

function applyCardEnhancements() {
  applyDealCardSpnRework(cardData, profileData);
  applyDealCardActionFocus(cardData, profileData);
  applyDealCardSpnHandoff(cardData);
  applyDealCardDocumentWorkflow(cardData);
  applyDealCardTaskDueDate(cardData);
  applyDealCardExpenseLabels();
  applyDealCardReadableValues();
  applyDealCardRiskResolution(cardData, profileData);
  applyDealResponsibilitySnapshot(cardData);
  void applySpnSaveConfirmation(cardData);
  void applyDealCardBazaHints(cardData, profileData);
}

function bindRerenderHook() {
  if (rerenderHookBound) return;
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest('[data-tab], [data-tab-shortcut]')) return;
    queueMicrotask(applyCardEnhancements);
  });
  rerenderHookBound = true;
}

export function applyDealCardRecheckAlert(data, profile) {
  try {
    cardData = data;
    profileData = profile || data?.profile || null;
    applyCardEnhancements();
    bindRerenderHook();
  } catch (_) {
    // Этот explicit hook не должен ломать основную карточку сделки.
  }
}
