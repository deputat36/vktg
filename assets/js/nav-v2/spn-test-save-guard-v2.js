const DRAFT_KEY = 'nav_deal_draft_v2';
let scheduled = false;
let armedButton = null;
let originalText = '';
let confirming = false;
let allowConfirmedSave = false;

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function isTestDraft() {
  const draft = readDraft();
  return Boolean(draft.createdFromChecklist || draft.testScenario);
}

function markButton(button) {
  if (!button || button.disabled || button.dataset.testSaveGuard === '1') return button;
  armedButton = button;
  originalText = button.textContent || 'Сохранить и открыть карточку';
  button.dataset.action = 'test-save-guard';
  button.dataset.testSaveGuard = '1';
  button.textContent = 'Тест: сохранить в CRM?';
  return button;
}

function armSaveButton() {
  if (allowConfirmedSave) return;
  const saveButton = document.querySelector('[data-action="save"]');
  if (!saveButton || saveButton.disabled) return;
  if (!isTestDraft()) {
    if (armedButton && armedButton.isConnected) {
      armedButton.dataset.action = 'save';
      delete armedButton.dataset.testSaveGuard;
      if (originalText) armedButton.textContent = originalText;
    }
    armedButton = null;
    originalText = '';
    return;
  }

  markButton(saveButton);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    armSaveButton();
  }, 80);
}

function releaseConfirmedSave() {
  setTimeout(() => {
    allowConfirmedSave = false;
    schedule();
  }, 1200);
}

function confirmRealSave(button) {
  if (confirming) return;
  confirming = true;
  const text = [
    'Это тестовый сценарий со страницы проверки мастера.',
    '',
    'Сохранить его в CRM как настоящую сделку?',
    '',
    'ОК — сохранить в CRM.',
    'Отмена — остаться в тесте.'
  ].join('\n');

  if (!confirm(text)) {
    confirming = false;
    return;
  }

  allowConfirmedSave = true;
  button.dataset.action = 'save';
  delete button.dataset.testSaveGuard;
  button.textContent = originalText || 'Сохранить и открыть карточку';

  setTimeout(() => {
    confirming = false;
    button.click();
    releaseConfirmedSave();
  }, 0);
}

function injectMiniHint() {
  if (!isTestDraft()) return;
  const button = document.querySelector('[data-test-save-guard="1"]');
  if (!button) return;
  const actions = button.closest('.actions');
  if (!actions || actions.querySelector('[data-test-save-hint]')) return;
  actions.insertAdjacentHTML('beforebegin', `<div class="status warn" data-test-save-hint="1" style="margin-top:12px"><b>Тестовый черновик:</b> сохранение в CRM потребует отдельного подтверждения. Для реальной сделки сначала нажмите «Очистить тест» в жёлтой плашке.</div>`);
}

function guardNativeSaveTarget(event) {
  if (allowConfirmedSave) return null;

  if (!isTestDraft()) {
    schedule();
    return null;
  }

  const nativeSaveButton = event.target?.closest?.('[data-action="save"]');
  if (!nativeSaveButton || nativeSaveButton.disabled) return null;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  return markButton(nativeSaveButton);
}

document.addEventListener('pointerdown', (event) => {
  guardNativeSaveTarget(event);
}, true);

document.addEventListener('click', (event) => {
  const nativeSaveButton = guardNativeSaveTarget(event);
  if (nativeSaveButton) {
    confirmRealSave(nativeSaveButton);
    return;
  }

  const button = event.target?.closest?.('[data-test-save-guard="1"]');
  if (!button) {
    schedule();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  confirmRealSave(button);
}, true);

document.addEventListener('pointerup', (event) => {
  const nativeSaveButton = guardNativeSaveTarget(event);
  if (nativeSaveButton) {
    confirmRealSave(nativeSaveButton);
    return;
  }

  const button = event.target?.closest?.('[data-test-save-guard="1"]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  confirmRealSave(button);
}, true);

const observer = new MutationObserver(() => {
  schedule();
  setTimeout(injectMiniHint, 120);
});

function start() {
  const host = document.getElementById('app');
  if (!host) return setTimeout(start, 150);
  observer.observe(host, { childList: true, subtree: true });
  schedule();
  setTimeout(injectMiniHint, 200);
}

window.addEventListener('storage', schedule);
start();
