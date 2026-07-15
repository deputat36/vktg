import { rpc } from './supabase-v2.js';
import { buildRiskResolutionDialog } from './action-dialog-model-v2.js?v=20260715-01';
import { clearActionDialogDraft, requestActionDialog } from './action-dialog-v2.js?v=20260715-01';

const MUTATING_ROLES = new Set(['owner', 'admin', 'manager', 'spn', 'lawyer', 'broker']);

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function isDemoDeal(deal) {
  return deal?.deal_summary?.demo === true
    || deal?.wizard_snapshot?.demo === true
    || String(deal?.title || '').startsWith('ДЕМО:');
}

function setPageStatus(message, type = 'info') {
  const status = document.getElementById('pageStatus');
  if (!status) return;
  status.className = `status ${type}`;
  status.textContent = message;
}

function canAttemptMutation(risk, deal, profile) {
  const role = String(profile?.role || '').toLowerCase();
  const userId = String(profile?.id || '');
  if (role === 'viewer') return false;
  if (!MUTATING_ROLES.has(role) || !userId) return false;
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'manager') return userId === String(deal?.manager_id || '');
  if (role === 'spn') {
    return [deal?.created_by, deal?.seller_spn_id, deal?.buyer_spn_id]
      .some((value) => userId === String(value || ''));
  }
  if (role === 'lawyer' || role === 'broker') {
    return !risk?.assigned_role || risk.assigned_role === role;
  }
  return false;
}

function activeRiskItems() {
  const activeTab = document.querySelector('[data-tab="risks"].active');
  const card = activeTab?.closest('section.card');
  if (!card) return [];
  const listRoot = Array.from(card.children).find((node) => node.classList?.contains('list'));
  return listRoot ? Array.from(listRoot.children).filter((node) => node.classList?.contains('list-item')) : [];
}

function appendStatus(item, risk) {
  const row = document.createElement('div');
  row.className = 'actions';
  row.style.justifyContent = 'flex-start';
  row.style.marginTop = '8px';

  const state = document.createElement('span');
  state.className = `pill ${risk.is_resolved ? 'green' : 'yellow'}`;
  state.textContent = risk.is_resolved ? 'риск устранён' : 'риск открыт';
  row.appendChild(state);

  if (risk.is_resolved && risk.resolved_at) {
    const resolvedAt = document.createElement('span');
    resolvedAt.className = 'small';
    resolvedAt.textContent = `зафиксировано: ${new Date(risk.resolved_at).toLocaleString('ru-RU')}`;
    row.appendChild(resolvedAt);
  }

  item.appendChild(row);
  return row;
}

function riskTitle(risk) {
  return String(risk?.title || risk?.description || risk?.risk_type || '').trim();
}

function appendAction(row, item, risk, deal, profile) {
  if (!canAttemptMutation(risk, deal, profile)) return;

  const nextState = risk.is_resolved !== true;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = nextState ? 'btn green' : 'btn light';
  button.setAttribute('data-risk-resolution', nextState ? 'resolved' : 'reopened');
  button.dataset.riskId = risk.id;
  button.textContent = nextState ? 'Устранить риск' : 'Вернуть в работу';

  button.onclick = async () => {
    const dialog = buildRiskResolutionDialog({
      nextState,
      isDemo: isDemoDeal(deal),
      riskTitle: riskTitle(risk)
    });
    const decision = await requestActionDialog(dialog, button);
    if (!decision.confirmed) return;

    const note = String(decision.value || '').trim();
    button.disabled = true;
    setPageStatus(nextState ? 'Фиксирую устранение риска...' : 'Возвращаю риск в работу...');

    try {
      const result = await rpc('nav_v2_update_risk_resolution', {
        p_risk_id: risk.id,
        p_is_resolved: nextState,
        p_note: note || null
      });
      clearActionDialogDraft(button);
      window.dispatchEvent(new CustomEvent('nav-v2:risk-resolution-updated', {
        detail: { riskId: risk.id, changed: result?.changed === true, isResolved: nextState }
      }));
      setPageStatus(result?.changed === false ? 'Состояние риска уже было актуальным.' : 'Состояние риска сохранено.', 'ok');
      setTimeout(() => location.reload(), 250);
    } catch (error) {
      button.disabled = false;
      setPageStatus(`Ошибка изменения риска: ${error.message}`, 'error');
    }
  };

  row.appendChild(button);
  item.dataset.riskResolutionReady = risk.id;
}

export function applyDealCardRiskResolution(data, profile) {
  const risks = list(data, 'risks');
  if (!risks.length) return;

  const items = activeRiskItems();
  if (items.length !== risks.length) return;

  items.forEach((item, index) => {
    const risk = risks[index];
    if (!risk?.id || item.dataset.riskResolutionReady === risk.id) return;
    const row = appendStatus(item, risk);
    appendAction(row, item, risk, data?.deal || {}, profile || data?.profile || {});
    if (!item.dataset.riskResolutionReady) item.dataset.riskResolutionReady = risk.id;
  });
}
