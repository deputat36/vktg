import { getCachedUser, rpc, esc } from './supabase-v2.js';
import {
  currentWizardSaveReceipt,
  releaseWizardSaveLease,
  storeWizardSaveReceipt,
  tryClaimWizardSaveLease,
  wizardSaveLeaseTtlMs,
  wizardSubmissionFingerprint
} from './spn-save-idempotency-model-v2.js';

const DRAFT_KEY = 'nav_deal_draft_v2';
const MONITOR_INTERVAL_MS = 250;
const START_CONFIRM_MS = 800;
let handling = false;
let bypassFingerprint = '';
let lastPointerAt = 0;

function readDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch (_) { return {}; }
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function saveButtonFromEvent(event) {
  return event.target?.closest?.('[data-action="save"], #saveDealBtn') || null;
}

function currentSaveButton() {
  return document.querySelector('[data-action="save"], #saveDealBtn');
}

function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function statusHost() {
  return document.getElementById('pageStatus') || document.getElementById('app');
}

function showGuardStatus(message, tone = 'warn', receipt = null) {
  const host = statusHost();
  if (!host) return;
  const link = receipt?.deal_id
    ? `<a class="btn light" href="./deal-card-v2.html?id=${encodeURIComponent(receipt.deal_id)}">Открыть сохранённую карточку</a>`
    : '<a class="btn light" href="./deals-v2.html">Открыть список сделок</a>';
  const existing = document.querySelector('[data-spn-save-idempotency]');
  const html = `<div class="status ${esc(tone)}" data-spn-save-idempotency="true" style="margin:10px 0">
    <b>${esc(message)}</b>
    <div class="actions" style="justify-content:flex-start;margin-top:8px">${link}</div>
  </div>`;
  if (existing) existing.outerHTML = html;
  else host.insertAdjacentHTML('afterend', html);
}

function randomToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function matchesCreatedDeal(deal, draft, startedAt) {
  const objectType = normalize(draft.objectType);
  const preparationMode = normalize(draft.preparationMode);
  const address = normalize(draft.address);
  const responseObjectType = normalize(deal?.object_type);
  const responsePreparationMode = normalize(deal?.preparation_mode);
  const responseAddress = normalize(deal?.address);

  if (deal?.created_by_current_user === false) return false;
  if (objectType && responseObjectType !== objectType) return false;
  if (preparationMode && responsePreparationMode && responsePreparationMode !== preparationMode) return false;

  // Старый production DTO не возвращает created_by_current_user и preparation_mode.
  // До серверного rollout сохраняем прежнюю точную проверку адреса как fallback.
  // Новый минимальный DTO подтверждает автора булевым фактом и не раскрывает адрес помещения.
  if (deal?.created_by_current_user !== true && address && responseAddress !== address) return false;

  const created = Date.parse(deal?.created_at || '');
  return !Number.isFinite(created) || created >= Number(startedAt) - 10_000;
}

async function findCreatedDeal(draft, startedAt) {
  const objectType = normalize(draft.objectType);
  const preparationMode = normalize(draft.preparationMode);
  const address = normalize(draft.address);
  if (!address && !objectType && !preparationMode) return null;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const data = await rpc('nav_v2_get_deals_list', { p_limit: 80 }, 30000);
      const items = Array.isArray(data?.items) ? data.items : [];
      const matches = items.filter((deal) => matchesCreatedDeal(deal, draft, startedAt));
      if (matches[0]?.id) return matches[0];
    } catch (_) {}
    await sleep(700 * attempt);
  }
  return null;
}

function saveStarted() {
  const button = currentSaveButton();
  const statusText = document.getElementById('pageStatus')?.textContent || '';
  return Boolean(button?.disabled || /сохраня/i.test(statusText));
}

function uncertainFailure() {
  const statusText = document.getElementById('pageStatus')?.textContent || '';
  return /не удалось подтвердить сохранение|проверьте, появилась ли заявка/i.test(statusText);
}

async function monitorSave({ draft, fingerprint, token, startedAt }) {
  const deadline = startedAt + wizardSaveLeaseTtlMs();
  while (Date.now() < deadline) {
    if (!localStorage.getItem(DRAFT_KEY)) {
      let receipt = storeWizardSaveReceipt(localStorage, fingerprint, {
        savedAt: Date.now(),
        dealId: null,
        address: draft.address,
        objectType: draft.objectType
      });
      const found = await findCreatedDeal(draft, startedAt);
      if (found?.id) {
        receipt = storeWizardSaveReceipt(localStorage, fingerprint, {
          savedAt: receipt.saved_at,
          dealId: found.id,
          address: draft.address,
          objectType: draft.objectType
        });
      }
      releaseWizardSaveLease(localStorage, fingerprint, token);
      return { state: 'saved', receipt };
    }
    if (uncertainFailure()) {
      showGuardStatus('Результат сохранения не подтверждён. Повторная идентичная отправка временно заблокирована; сначала проверьте список сделок.', 'warn');
      return { state: 'uncertain' };
    }
    await sleep(MONITOR_INTERVAL_MS);
  }
  return { state: 'timeout' };
}

async function startUnderLease(button, draft, fingerprint, token) {
  const claim = tryClaimWizardSaveLease(localStorage, fingerprint, token, Date.now());
  if (!claim.acquired) {
    showGuardStatus('Такая же заявка уже сохраняется в другой вкладке. Дождитесь результата и не отправляйте её повторно.', 'warn');
    return;
  }

  const startedAt = Date.now();
  bypassFingerprint = fingerprint;
  button.click();
  await sleep(START_CONFIRM_MS);
  if (bypassFingerprint === fingerprint) bypassFingerprint = '';

  if (!saveStarted()) {
    releaseWizardSaveLease(localStorage, fingerprint, token);
    return;
  }

  await monitorSave({ draft, fingerprint, token, startedAt });
}

async function guardedStart(button, draft, fingerprint) {
  const receipt = currentWizardSaveReceipt(localStorage, fingerprint, Date.now());
  if (receipt) {
    showGuardStatus('Идентичная заявка уже была сохранена недавно. Повторная отправка остановлена.', 'ok', receipt);
    return;
  }

  const token = randomToken();
  const lockName = `nav-v2-wizard-save:${fingerprint}`;
  if (navigator.locks?.request) {
    let acquired = false;
    await navigator.locks.request(lockName, { ifAvailable: true, mode: 'exclusive' }, async (lock) => {
      if (!lock) return;
      acquired = true;
      await startUnderLease(button, draft, fingerprint, token);
    });
    if (!acquired) showGuardStatus('Такая же заявка уже сохраняется в другой вкладке. Повторная отправка остановлена.', 'warn');
    return;
  }

  await startUnderLease(button, draft, fingerprint, token);
}

async function guardSave(event) {
  const button = saveButtonFromEvent(event);
  if (!button || button.disabled) return;
  const user = getCachedUser();
  const draft = readDraft();
  const fingerprint = wizardSubmissionFingerprint(draft, user?.id || '');

  if (bypassFingerprint && bypassFingerprint === fingerprint) {
    bypassFingerprint = '';
    return;
  }

  stopEvent(event);
  if (handling) {
    showGuardStatus('Сохранение уже запускается. Не нажимайте кнопку повторно.', 'warn');
    return;
  }

  handling = true;
  try {
    await guardedStart(button, draft, fingerprint);
  } finally {
    handling = false;
  }
}

document.addEventListener('pointerup', (event) => {
  const button = saveButtonFromEvent(event);
  if (!button || button.disabled) return;
  lastPointerAt = Date.now();
  void guardSave(event);
}, true);

document.addEventListener('click', (event) => {
  const button = saveButtonFromEvent(event);
  if (!button || button.disabled) return;
  if (Date.now() - lastPointerAt < 500 && !bypassFingerprint) {
    stopEvent(event);
    return;
  }
  void guardSave(event);
}, true);
