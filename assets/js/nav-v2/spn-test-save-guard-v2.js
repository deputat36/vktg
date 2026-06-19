const DRAFT_KEY = 'nav_deal_draft_v2';
let scheduled = false;
let armedButton = null;
let originalText = '';

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function isTestDraft() {
  const draft = readDraft();
  return Boolean(draft.createdFromChecklist || draft.testScenario);
}

function armSaveButton() {
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

  if (saveButton.dataset.testSaveGuard === '1') return;
  armedButton = saveButton;
  originalText = saveButton.textContent || 'Сохранить и открыть карточку';
  saveButton.dataset.action = 'test-save-guard';
  saveButton.dataset.testSaveGuard = '1';
  saveButton.textContent = 'Тест: сохранить в CRM?';
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    armSaveButton();
  }, 80);
}

function clearTestDraft() {
  localStorage.removeItem(DRAFT_KEY);
  window.location.href = './spn-v2.html?test=20260617-91';
}

function confirmRealSave(button) {
  const text = [
    'Это тестовый сценарий со страницы проверки мастера.',
    '',
    'Сохранить его в CRM как настоящую сделку?',
    '',
    'ОК — сохранить в CRM.',
    'Отмена — остаться в тесте.'
  ].join('\n');

  if (!confirm(text)) return;
  button.dataset.action = 'save';
  delete button.dataset.testSaveGuard;
  button.textContent = originalText || 'Сохранить и открыть карточку';
  button.click();
}

function injectMiniHint() {
  if (!isTestDraft()) return;
  const button = document.querySelector('[data-test-save-guard="1"]');
  if (!button) return;
  const actions = button.closest('.actions');
  if (!actions || actions.querySelector('[data-test-save-hint]')) return;
  actions.insertAdjacentHTML('beforebegin', `<div class="status warn" data-test-save-hint="1" style="margin-top:12px"><b>Тестовый черновик:</b> сохранение в CRM потребует отдельного подтверждения. Для реальной сделки сначала нажмите «Очистить тест» в жёлтой плашке.</div>`);
}

document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('[data-test-save-guard="1"]');
  if (!button) {
    schedule();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  confirmRealSave(button);
}, true);

document.addEventListener('pointerup', (event) => {
  const button = event.target?.closest?.('[data-test-save-guard="1"]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
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
