import { getDeal } from '../ui/form.js';
import { loadData } from '../core/data.js';
import { analyzeDeal } from '../core/engine.js';
import { createDealInSupabase, updateDealInSupabase } from './supabaseDeals.js';

let currentDealId = null;
let currentDealTitle = null;
let cachedData = null;

function status(text) {
  const el = document.getElementById('cloudStatus') || document.getElementById('status');
  if (el) el.textContent = text;
}

function emit(name) {
  window.dispatchEvent(new CustomEvent(name, { detail: { id: currentDealId, title: currentDealTitle } }));
}

function markState() {
  let el = document.getElementById('cloudRoleState');
  const panel = document.getElementById('cloudPanel');
  if (!el && panel) {
    el = document.createElement('div');
    el.id = 'cloudRoleState';
    el.className = 'status';
    panel.querySelector('h2')?.insertAdjacentElement('afterend', el);
  }
  if (el) {
    el.textContent = currentDealId
      ? 'CRM-режим: открытая сделка будет обновлена.'
      : 'CRM-режим: новая сделка сохранится с ролевыми признаками для СПН, юриста, брокера и менеджера.';
  }
}

async function analysis() {
  if (!cachedData) cachedData = await loadData();
  return analyzeDeal(getDeal(), cachedData);
}

async function saveRoleAware() {
  const result = await analysis();
  const saved = currentDealId
    ? await updateDealInSupabase(currentDealId, result)
    : await createDealInSupabase(result);
  currentDealId = saved.id;
  currentDealTitle = saved.title;
  markState();
  emit('navigatorDealSaved');
  status('Сделка сохранена в CRM: ' + saved.title);
  alert('Сделка сохранена в CRM: ' + saved.title);
}

function patch() {
  const btn = document.getElementById('btnSaveCloud');
  if (!btn) return false;
  btn.onclick = async () => {
    try {
      await saveRoleAware();
    } catch (error) {
      alert('Ошибка сохранения CRM: ' + error.message);
    }
  };
  markState();
  return true;
}

window.addEventListener('navigatorDealOpened', (event) => {
  currentDealId = event.detail?.id || null;
  currentDealTitle = event.detail?.title || null;
  markState();
});

let attempts = 0;
const timer = setInterval(() => {
  attempts += 1;
  if (patch() || attempts > 60) clearInterval(timer);
}, 250);
