import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const SESSION_KEY = 'nav_session_v2';
let checks = [];

function session() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
}

function decodeJwt(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(base64), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
  } catch (_) { return null; }
}

function statusClass(status) {
  if (status === 'ok') return 'green';
  if (status === 'warn') return 'yellow';
  if (status === 'error') return 'red';
  return 'blue';
}

function statusText(status) {
  if (status === 'ok') return 'OK';
  if (status === 'warn') return 'Внимание';
  if (status === 'error') return 'Ошибка';
  return 'Проверка';
}

function addCheck(title, status, details = '', meta = '') {
  checks.push({ title, status, details, meta });
  render();
}

function updateCheck(title, status, details = '', meta = '') {
  const item = checks.find((check) => check.title === title);
  if (item) Object.assign(item, { status, details, meta });
  else checks.push({ title, status, details, meta });
  render();
}

function renderCheck(item) {
  return `<div class="list-item">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
      <div>
        <b>${esc(item.title)}</b>
        ${item.details ? `<p class="muted">${esc(item.details)}</p>` : ''}
        ${item.meta ? `<span class="small">${esc(item.meta)}</span>` : ''}
      </div>
      <span class="pill ${statusClass(item.status)}">${statusText(item.status)}</span>
    </div>
  </div>`;
}

function summary() {
  const errors = checks.filter((item) => item.status === 'error').length;
  const warnings = checks.filter((item) => item.status === 'warn').length;
  const ok = checks.filter((item) => item.status === 'ok').length;
  if (errors) return `<div class="status error">Есть ошибки: ${errors}. Сначала устраните их, потом проверяйте сценарии CRM.</div>`;
  if (warnings) return `<div class="status warn">Критичных ошибок нет, но есть предупреждения: ${warnings}.</div>`;
  if (ok) return `<div class="status ok">Проверка идет или уже завершена. Успешных пунктов: ${ok}.</div>`;
  return `<div class="status">Нажмите «Запустить проверку».</div>`;
}

function render() {
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero">
      <h1>Проверка системы v2</h1>
      <p>Диагностика входа, роли, Supabase, сделок, рабочего стола, команды и Edge Function доступа. Таблицы CRM «Лидер» не используются.</p>
    </section>
    ${summary()}
    <section class="card">
      <div class="section-title">
        <div>
          <h2>Результаты</h2>
          <p class="muted">Проверки выполняются независимо. Если один блок не загрузился, остальные продолжают работать.</p>
        </div>
        <button id="runCheck" class="btn primary" type="button">Запустить проверку</button>
      </div>
      <div class="list">${checks.map(renderCheck).join('') || '<div class="empty">Проверка еще не запускалась.</div>'}</div>
    </section>
    <section class="grid">
      <div class="card">
        <h2>Быстрые действия</h2>
        <div class="actions" style="justify-content:flex-start">
          <a class="btn light" href="./dashboard-v2.html">Рабочий стол</a>
          <a class="btn light" href="./deals-v2.html">Сделки</a>
          <a class="btn light" href="./admin-v2.html">Команда</a>
          <a class="btn light" href="./nav-temp-password-v2.html">Ссылка доступа</a>
        </div>
      </div>
      <div class="card">
        <h2>Что проверяется</h2>
        <div class="list">
          <div class="list-item"><b>Auth</b>Есть ли сессия и не истек ли токен.</div>
          <div class="list-item"><b>Профиль</b>Есть ли пользователь в nav_user_profiles и какая роль назначена.</div>
          <div class="list-item"><b>CRM</b>Загрузка сделок, рабочего стола и команды.</div>
          <div class="list-item"><b>Доступ</b>Доступна ли Edge Function nav-invite-user.</div>
        </div>
      </div>
    </section>
  </main>`;
  const btn = document.getElementById('runCheck');
  if (btn) btn.onclick = runAllChecks;
}

async function refreshSessionIfNeeded() {
  const s = session();
  if (!s?.refresh_token) throw new Error('Нет refresh_token. Нужно войти заново.');
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.message || data.error || response.statusText);
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  return data;
}

async function checkAuth() {
  const user = getCachedUser();
  const s = session();
  const jwt = decodeJwt(s?.access_token);
  if (!user?.id || !s?.access_token) {
    updateCheck('Вход в систему', 'error', 'Сессия не найдена. Нужно войти в Навигатор.', 'nav-v2.html');
    return null;
  }
  const expMs = Number(jwt?.exp || 0) * 1000;
  const minutesLeft = Math.round((expMs - Date.now()) / 60000);
  if (expMs && minutesLeft < 5) {
    updateCheck('Вход в систему', 'warn', `Токен скоро истечет или уже истек. Осталось минут: ${minutesLeft}. Пробую обновить сессию.`, user.email || user.id);
    try {
      await refreshSessionIfNeeded();
      updateCheck('Вход в систему', 'ok', 'Сессия обновлена.', user.email || user.id);
    } catch (e) {
      updateCheck('Вход в систему', 'error', 'Не удалось обновить сессию: ' + e.message, user.email || user.id);
    }
  } else {
    updateCheck('Вход в систему', 'ok', `Сессия найдена. Токен действителен примерно ${minutesLeft} мин.`, user.email || user.id);
  }
  return getCachedUser();
}

async function checkProfile() {
  updateCheck('Профиль и роль', 'info', 'Проверяю nav_user_profiles...');
  try {
    const data = await rpc('nav_v2_list_users', {}, 15000);
    const user = getCachedUser();
    const profile = (data.items || []).find((item) => item.id === user?.id || item.email === user?.email);
    if (!profile) {
      updateCheck('Профиль и роль', 'error', 'Текущий пользователь не найден в nav_user_profiles.', user?.email || '');
      return;
    }
    updateCheck('Профиль и роль', profile.is_active ? 'ok' : 'warn', `Роль: ${profile.role}. Статус: ${profile.is_active ? 'активен' : 'выключен'}.`, profile.email);
  } catch (e) {
    updateCheck('Профиль и роль', 'error', e.message);
  }
}

async function checkDeals() {
  updateCheck('Список сделок', 'info', 'Проверяю nav_v2_get_deals_list...');
  try {
    const data = await rpc('nav_v2_get_deals_list', { p_limit: 20 }, 15000);
    updateCheck('Список сделок', 'ok', `Загружено сделок: ${(data.items || []).length}.`, `Роль: ${data.profile?.role || '—'}`);
  } catch (e) {
    updateCheck('Список сделок', 'error', e.message);
  }
}

async function checkDashboard() {
  updateCheck('Рабочий стол', 'info', 'Проверяю nav_v2_get_dashboard...');
  try {
    const data = await rpc('nav_v2_get_dashboard', {}, 15000);
    updateCheck('Рабочий стол', 'ok', `Всего сделок: ${data.summary?.total ?? '—'}. Открытых задач: ${(data.tasks || []).length}.`, `Роль: ${data.profile?.role || '—'}`);
  } catch (e) {
    updateCheck('Рабочий стол', 'error', e.message);
  }
}

async function checkTeam() {
  updateCheck('Команда', 'info', 'Проверяю список пользователей Навигатора...');
  try {
    const data = await rpc('nav_v2_list_users', {}, 15000);
    updateCheck('Команда', 'ok', `Пользователей в Навигаторе: ${(data.items || []).length}.`);
  } catch (e) {
    updateCheck('Команда', 'error', e.message);
  }
}

async function checkEdgeFunction() {
  updateCheck('Edge Function доступа', 'info', 'Проверяю доступность nav-invite-user без создания пользователя...');
  const s = session();
  if (!s?.access_token) {
    updateCheck('Edge Function доступа', 'error', 'Нет access_token.');
    return;
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/nav-invite-user`, {
      method: 'OPTIONS',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error(response.statusText || 'Edge Function недоступна');
    updateCheck('Edge Function доступа', 'ok', 'Функция отвечает на OPTIONS-запрос. Создание ссылки доступа проверяется отдельно на странице доступа.');
  } catch (e) {
    updateCheck('Edge Function доступа', 'error', e.message);
  }
}

async function runAllChecks() {
  checks = [];
  render();
  addCheck('Старт проверки', 'ok', 'Проверка запущена.');
  const user = await checkAuth();
  if (!user?.id) return;
  await checkProfile();
  await checkDeals();
  await checkDashboard();
  await checkTeam();
  await checkEdgeFunction();
  updateCheck('Старт проверки', 'ok', 'Проверка завершена.');
}

async function init() {
  setupTop('admin');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  render();
}

init();
