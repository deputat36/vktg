import { getDeal, applyDealPatch } from '../ui/form.js';
import { loadData } from '../core/data.js';
import { analyzeDeal } from '../core/engine.js';
import { saveDealToSupabase, listMyDeals, isSupabaseConfigured } from './supabase.js';
import { getDealFromSupabase, updateDealInSupabase } from './supabaseDeals.js';

let currentDealId = null;
let currentDealTitle = null;
let cachedData = null;

function setStatus(text) {
  const el = document.getElementById('cloudStatus') || document.getElementById('status');
  if (el) el.textContent = text;
}

function emitDealEvent(name) {
  window.dispatchEvent(new CustomEvent(name, {
    detail: {
      id: currentDealId,
      title: currentDealTitle
    }
  }));
}

async function getAnalysis() {
  if (!cachedData) cachedData = await loadData();
  return analyzeDeal(getDeal(), cachedData);
}

function showEditState() {
  let el = document.getElementById('cloudEditState');
  const panel = document.getElementById('cloudPanel');
  if (!el && panel) {
    el = document.createElement('div');
    el.id = 'cloudEditState';
    el.className = 'status';
    panel.querySelector('h2')?.insertAdjacentElement('afterend', el);
  }
  if (el) {
    el.textContent = currentDealId
      ? 'Открыта сделка: ' + (currentDealTitle || currentDealId) + '. Сохранение обновит эту запись.'
      : 'Сделка не открыта из Supabase. Сохранение создаст новую запись.';
  }
}

async function openCloudDeal(id) {
  const row = await getDealFromSupabase(id);
  applyDealPatch(row.deal_json || {});
  currentDealId = row.id;
  currentDealTitle = row.title;
  document.querySelector('input,select,textarea')?.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-tab="summary"]')?.click();
  showEditState();
  emitDealEvent('navigatorDealOpened');
  setStatus('Открыта сделка из Supabase: ' + row.title);
}

async function saveCloudDeal() {
  const result = await getAnalysis();
  const saved = currentDealId
    ? await updateDealInSupabase(currentDealId, result)
    : await saveDealToSupabase(result);
  currentDealId = saved.id;
  currentDealTitle = saved.title;
  showEditState();
  emitDealEvent('navigatorDealSaved');
  setStatus('Сделка сохранена: ' + saved.title);
  alert('Сделка сохранена: ' + saved.title);
}

async function renderCloudDeals() {
  const items = await listMyDeals(50);
  const target = document.getElementById('cloudDealsList');
  if (!target) return;
  if (!items.length) {
    target.innerHTML = '<div class="box grayBox">Сохраненных сделок пока нет.</div>';
    return;
  }
  target.innerHTML = '<div class="box blue"><h3>Последние сделки</h3><table><tr><th>Дата</th><th>Название</th><th>Статус</th><th>Готовность</th><th>Действия</th></tr>' +
    items.map((item) => '<tr><td>' + new Date(item.updated_at || item.created_at).toLocaleString('ru-RU') + '</td><td>' + (item.title || '—') + '</td><td>' + (item.status || '—') + '</td><td>' + (item.readiness_deposit || 0) + '%</td><td><button class="light" data-open-cloud-deal="' + item.id + '">Открыть</button></td></tr>').join('') +
    '</table></div>';
  target.querySelectorAll('[data-open-cloud-deal]').forEach((btn) => {
    btn.onclick = async () => {
      try { await openCloudDeal(btn.dataset.openCloudDeal); }
      catch (e) { alert('Ошибка открытия сделки: ' + e.message); }
    };
  });
}

function ensureDetachButton() {
  const panel = document.getElementById('cloudPanel');
  if (!panel || document.getElementById('btnCloudDetach')) return;
  const btn = document.createElement('button');
  btn.id = 'btnCloudDetach';
  btn.className = 'light';
  btn.textContent = 'Сохранить как новую';
  btn.onclick = () => {
    currentDealId = null;
    currentDealTitle = null;
    showEditState();
    emitDealEvent('navigatorDealOpened');
    setStatus('Связь с открытой сделкой сброшена. Следующее сохранение создаст новую запись.');
  };
  panel.querySelector('.actions')?.appendChild(btn);
}

function patchButtons() {
  if (!isSupabaseConfigured()) return false;
  const saveBtn = document.getElementById('btnSaveCloud');
  const listBtn = document.getElementById('btnListCloud');
  if (!saveBtn || !listBtn) return false;

  saveBtn.onclick = async () => {
    try { await saveCloudDeal(); }
    catch (e) { alert('Ошибка сохранения: ' + e.message); }
  };

  listBtn.onclick = async () => {
    try {
      await renderCloudDeals();
      document.querySelector('[data-tab="cloudDeals"]')?.click();
    } catch (e) {
      alert('Ошибка загрузки сделок: ' + e.message);
    }
  };

  ensureDetachButton();
  showEditState();
  return true;
}

function start() {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (patchButtons() || attempts > 50) clearInterval(timer);
  }, 200);
}

start();
