import { rpc } from './supabase-v2.js';
import { buildLawyerHandoffDialog } from './action-dialog-model-v2.js?v=20260715-03';
import { requestActionDialog } from './action-dialog-v2.js?v=20260715-02';
import { applyPageActionFeedback } from './page-action-feedback-v2.js?v=20260715-01';

let cardData = null;

function clean(value) { return String(value || '').trim().replace(/\s+/g, ' '); }
function isDemoDeal() {
  const deal = cardData?.deal || {};
  return deal?.deal_summary?.demo === true || deal?.wizard_snapshot?.demo === true || String(deal?.title || '').startsWith('ДЕМО:');
}
function handoffPanel() {
  return [...document.querySelectorAll('section.card')].find((section) => clean(section.querySelector('h2')?.textContent) === 'Перед передачей юристу') || null;
}
function handoffIssues() {
  const panel = handoffPanel();
  if (!(panel instanceof HTMLElement)) return [];
  const ready = [...panel.querySelectorAll('.pill')].some((pill) => clean(pill.textContent) === 'можно передавать');
  if (ready) return [];
  return [...panel.querySelectorAll('.list > .list-item')].map((item) => clean(item.textContent)).filter(Boolean);
}
function setPageStatus(message, type = 'busy') { return applyPageActionFeedback(message, type === 'ok' ? 'success' : type === 'error' ? 'error' : 'busy'); }

async function transferToLawyer(button, issues) {
  const config = buildLawyerHandoffDialog({ issues, isDemo: isDemoDeal() });
  const decision = await requestActionDialog(config, button);
  if (!decision.confirmed) return;
  button.disabled = true;
  setPageStatus('Передаю сделку юристу...');
  try {
    const dealId = new URLSearchParams(location.search).get('id') || '';
    await rpc('nav_v2_update_deal_status', { p_deal_id: dealId, p_status: 'need_lawyer' });
    setPageStatus('Сделка передана юристу. Обновляю карточку...', 'ok');
    setTimeout(() => location.reload(), 200);
  } catch (error) {
    button.disabled = false;
    setPageStatus(`Ошибка быстрого действия: ${error.message}`, 'error');
  }
}

function bindLawyerHandoff() {
  const button = document.querySelector('[data-quick-status="need_lawyer"]');
  if (!(button instanceof HTMLButtonElement)) return;
  const issues = handoffIssues();
  if (!issues.length) return;
  if (button.dataset.lawyerHandoffDialog === 'ready') return;
  button.dataset.lawyerHandoffDialog = 'ready';
  button.onclick = () => void transferToLawyer(button, handoffIssues());
}

export function applyDealCardLawyerHandoffDialog(data) {
  try {
    cardData = data || cardData;
    bindLawyerHandoff();
  } catch (_) {
  }
}
