import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const MARK = 'navV2DealCardTimeoutRecovery';
const RETRY_PARAM = 'timeout_retry';
const SESSION_KEY = 'nav_session_v2';
let handled = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function isTimeoutErrorText(text) {
  const value = String(text || '').toLowerCase();
  return value.includes('supabase не ответил') || value.includes('не удалось подключиться к supabase');
}

function currentDealId() {
  return new URLSearchParams(location.search).get('id') || '';
}

function retryUrl() {
  const url = new URL(location.href);
  url.searchParams.set(RETRY_PARAM, '1');
  url.searchParams.set('cache', String(Date.now()));
  return url.href;
}

function checkUrl() {
  return `./deal-card-check-v2.html?id=${encodeURIComponent(currentDealId())}&cache=${Date.now()}`;
}

function hasRetried() {
  return new URLSearchParams(location.search).get(RETRY_PARAM) === '1';
}

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
}

function headers() {
  const session = readSession();
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: 'Bearer ' + (session?.access_token || SUPABASE_PUBLISHABLE_KEY),
    'Content-Type': 'application/json'
  };
}

async function fetchWithTimeout(url, options, timeout = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fallbackRpc(name, payload) {
  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.hint || data?.error || `Ошибка Supabase ${response.status}`);
  return data;
}

function money(value) {
  if (value === null || value === undefined || value === '') return '—';
  return Number(value).toLocaleString('ru-RU') + ' ₽';
}

function list(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

function renderMiniCard(data, sourceText) {
  const app = document.getElementById('app');
  if (!app) return;
  const deal = data?.deal || {};
  const docs = list(data, 'documents');
  const tasks = list(data, 'tasks');
  const missingDocs = docs.filter((doc) => doc.is_required && !['received', 'checked', 'not_required'].includes(doc.status)).length;
  const openTasks = tasks.filter((task) => ['open', 'in_progress'].includes(task.status)).length;
  const title = deal.display_title || deal.title || 'Карточка сделки';
  const docItems = docs.slice(0, 8).map((doc) => `<div class="list-item"><b>${esc(doc.title)}</b><span class="small">${esc(doc.status || 'нужен')} · ${esc(doc.side || '')}</span></div>`).join('');
  const taskItems = tasks.slice(0, 8).map((task) => `<div class="list-item"><b>${esc(task.title)}</b><span class="small">${esc(task.status || 'открыта')} · ${esc(task.assigned_role || '')}</span></div>`).join('');
  app.innerHTML = `<main class="nav-v2-shell" id="${MARK}">
    <section class="hero"><h1>${esc(title)}</h1><p>${esc(deal.address || deal.next_action || 'Минимальная карточка загружена аварийным режимом.')}</p></section>
    <section class="card">
      <div class="status warn">Основная карточка не дождалась ответа Supabase. Ниже показана аварийная сводка. ${esc(sourceText || '')}</div>
      <div class="kpi-row">
        <div class="metric"><span>Цена</span><b>${money(deal.price_total)}</b></div>
        <div class="metric"><span>Документы</span><b>${missingDocs}</b></div>
        <div class="metric"><span>Задачи</span><b>${openTasks}</b></div>
        <div class="metric"><span>Статус</span><b>${esc(deal.status || '—')}</b></div>
      </div>
      <div class="actions" style="justify-content:flex-start">
        <a class="btn primary" href="${retryUrl()}">Повторить полную загрузку</a>
        <a class="btn light" href="${checkUrl()}">Проверка карточки</a>
        <a class="btn light" href="./deals-v2.html">К списку сделок</a>
        <a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a>
      </div>
    </section>
    <section class="grid">
      <div class="card"><h2>Документы</h2><div class="list">${docItems || '<div class="empty">Документы не найдены.</div>'}</div></div>
      <div class="card"><h2>Задачи</h2><div class="list">${taskItems || '<div class="empty">Задачи не найдены.</div>'}</div></div>
    </section>
  </main>`;
}

function renderRecovery(errorText) {
  if (document.getElementById(MARK)) return;
  const app = document.getElementById('app');
  if (!app) return;
  const dealId = currentDealId();
  const article = document.createElement('main');
  article.className = 'nav-v2-shell';
  article.id = MARK;
  article.innerHTML = `<section class="hero"><h1>Карточка временно не загрузилась</h1><p>Доступ к сделке есть, но браузер не дождался ответа Supabase.</p></section>
    <section class="card">
      <div class="status warn">${esc(errorText || 'Supabase не ответил вовремя.')}</div>
      <div class="list">
        <div class="list-item"><b>ID сделки</b>${esc(dealId || 'не указан')}</div>
        <div class="list-item"><b>Что сделать</b>Нажмите «Повторить загрузку». Если ошибка повторяется, откройте проверку карточки или чистый вход.</div>
      </div>
      <div class="actions" style="justify-content:flex-start">
        <a class="btn primary" href="${retryUrl()}">Повторить загрузку</a>
        <a class="btn light" href="${checkUrl()}">Проверка карточки</a>
        <a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a>
        <a class="btn light" href="./deals-v2.html">К списку сделок</a>
      </div>
    </section>`;
  app.innerHTML = '';
  app.appendChild(article);
}

async function tryFallback(errorText) {
  const id = currentDealId();
  if (!id) return renderRecovery(errorText);
  const app = document.getElementById('app');
  if (app) app.innerHTML = '<main class="nav-v2-shell"><div class="status warn">Основная карточка не загрузилась. Пробую аварийную загрузку сделки...</div></main>';
  try {
    const data = await fallbackRpc('nav_v2_get_deal_card', { p_deal_id: id });
    renderMiniCard(data, errorText);
  } catch (error) {
    renderRecovery((errorText || '') + ' Аварийная загрузка тоже не удалась: ' + error.message);
  }
}

function inspect() {
  const app = document.getElementById('app');
  if (!app || handled) return;
  const text = app.textContent || '';
  if (!isTimeoutErrorText(text)) return;
  handled = true;
  if (!hasRetried()) {
    setTimeout(() => { location.href = retryUrl(); }, 600);
    return;
  }
  tryFallback(text.trim());
}

new MutationObserver(inspect).observe(document.getElementById('app') || document.body, { childList: true, subtree: true, characterData: true });
inspect();
