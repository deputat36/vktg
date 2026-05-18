import { $, esc } from '../core/utils.js';
import { applyDealPatch } from '../ui/form.js';
import { getDealFromSupabase, updateDealInSupabase } from './supabaseDeals.js';
import { saveDealToSupabase, listMyDeals } from './supabase.js';

export function createCloudEditor({ analyzeAndRender, getCurrentResult, setStatus }) {
  const state = {
    currentCloudDealId: null,
    currentCloudDealTitle: null
  };

  function updateStatus() {
    const el = $('cloudEditStatus');
    if (!el) return;
    el.textContent = state.currentCloudDealId
      ? 'Открыта сделка: ' + (state.currentCloudDealTitle || state.currentCloudDealId) + '. Сохранение обновит эту запись.'
      : 'Сделка не открыта из Supabase. Сохранение создаст новую запись.';
  }

  function resetBinding() {
    state.currentCloudDealId = null;
    state.currentCloudDealTitle = null;
    updateStatus();
  }

  function addEditStatusPanel() {
    const panel = $('cloudPanel');
    if (!panel || $('cloudEditStatus')) return;
    const div = document.createElement('div');
    div.id = 'cloudEditStatus';
    div.className = 'status';
    div.textContent = 'Сделка не открыта из Supabase.';
    panel.querySelector('h2')?.insertAdjacentElement('afterend', div);

    const btn = document.createElement('button');
    btn.id = 'btnDetachCloudDeal';
    btn.className = 'light';
    btn.textContent = 'Сохранить как новую';
    btn.onclick = () => {
      resetBinding();
      setStatus('Связь с открытой Supabase-сделкой сброшена. Следующее сохранение создаст новую запись.');
    };
    panel.querySelector('.actions')?.appendChild(btn);
  }

  async function saveCurrent() {
    const result = getCurrentResult();
    const saved = state.currentCloudDealId
      ? await updateDealInSupabase(state.currentCloudDealId, result)
      : await saveDealToSupabase(result);
    state.currentCloudDealId = saved.id;
    state.currentCloudDealTitle = saved.title;
    updateStatus();
    return saved;
  }

  async function openDeal(dealId) {
    const item = await getDealFromSupabase(dealId);
    applyDealPatch(item.deal_json || {});
    state.currentCloudDealId = item.id;
    state.currentCloudDealTitle = item.title;
    analyzeAndRender();
    updateStatus();
    document.querySelector('[data-tab="summary"]')?.click();
    setStatus('Открыта сделка из Supabase: ' + item.title);
  }

  async function renderDealList() {
    const items = await listMyDeals();
    const target = $('cloudDealsList');
    if (!target) return;
    if (!items.length) {
      target.innerHTML = '<div class="box grayBox">Сохраненных сделок пока нет.</div>';
      return;
    }
    target.innerHTML = '<div class="box blue"><h3>Последние сделки</h3><table><tr><th>Дата</th><th>Название</th><th>Статус</th><th>Готовность</th><th>Действия</th></tr>' +
      items.map((item) => '<tr><td>' + new Date(item.updated_at || item.created_at).toLocaleString('ru-RU') + '</td><td>' + esc(item.title || '—') + '</td><td>' + esc(item.status || '—') + '</td><td>' + (item.readiness_deposit || 0) + '%</td><td><button class="light" data-open-cloud-deal="' + item.id + '">Открыть</button></td></tr>').join('') +
      '</table></div>';
    target.querySelectorAll('[data-open-cloud-deal]').forEach((btn) => {
      btn.onclick = async () => {
        try { await openDeal(btn.dataset.openCloudDeal); }
        catch (e) { alert('Ошибка открытия сделки: ' + e.message); }
      };
    });
  }

  return { addEditStatusPanel, resetBinding, saveCurrent, renderDealList, openDeal };
}
