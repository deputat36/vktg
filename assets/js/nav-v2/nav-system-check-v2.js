import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const SESSION_KEY = 'nav_session_v2';
let checks = [];
let currentProfile = null;
let dashboardOk = false;

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
  if (errors) return `<div class="status error">Есть ошибки: ${errors}. Проверьте пункты ниже.</div>`;
  if (warnings) return `<div class="status warn">Критичных ошибок нет, но есть предупреждения: ${warnings}. CRM можно проверять, если основные рабочие экраны открываются.</div>`;
  if (ok) return `<div class="status ok">Проверка идет или уже завершена. Успешных пунктов: ${ok}.</div>`;
  return `<div class="status">Нажмите «Запустить проверку».</div>`;
}

function actionLinks() {
  const role = currentProfile?.role || '';
  if (role === 'lawyer') {
    return `<a class="btn light" href="./dashboard-v2.html">Рабочий стол</a><a class="btn light" href="./deals-v2.html?filter=lawyer">Юридическая очередь</a><a class="btn light" href="./nav-system-check-v2.html">Проверка</a>`;
  }
  if (role === 'broker') {
    return `<a class="btn light" href="./dashboard-v2.html">Рабочий стол</a><a class="btn light" href="./deals-v2.html?filter=broker">Брокерская очередь</a><a class="btn light" href="./nav-system-check-v2.html">Проверка</a>`;
  }
  if (role === 'spn') {
    return `<a class="btn light" href="./dashboard-v2.html">Рабочий стол</a><a class="btn light" href="./spn-v2.html">Новая сделка</a><a class="btn light" href="./deals-v2.html">Мои сделки</a>`;
  }
  if (role === 'owner' || role === 'admin') {
    return `<a class="btn light" href="./dashboard-v2.html">Рабочий стол</a><a class="btn light" href="./spn-v2.html">Новая сделка</a><a class="btn light" href="./deals-v2.html">Сделки</a><a class="btn light" href="./admin-v2.html">Команда</a><a class="btn light" href="./nav-access-v2.html">Доступ</a>`;
  }
  return `<a class="btn light" href="./dashboard-v2.html">Рабочий стол</a><a class="btn light" href="./deals-v2.html">Сделки</a><a class="btn light" href="./nav-system-check-v2.html">Проверка</a>`;
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
          <p class="muted">Проверки выполняются с учетом роли пользователя. Закрытые админ-разделы для неадминов не считаются ошибкой.</p>
        </div>
        <button id="runCheck" class="btn primary" type="button">Запустить проверку</button>
      </div>
      <div class="list">${checks.map(renderCheck).join('') || '<div class="empty">Проверка еще не запускалась.</div>'}</div>
    </section>
    <section class="grid">
      <div class="card">
        <h2>Быстрые действия</h2>
        <div class="actions" style="justify-content:flex-start">${actionLinks()}</div>
      </div>
      <div class="card">
        <h2>Что проверяется</h2>
        <div class="list">
          <div class="list-item"><b>Auth</b>Есть ли сессия и не истек ли токен.</div>
          <div class="list-item"><b>Профиль</b>Есть ли пользователь в nav_user_profiles и какая роль назначена.</div>
          <div class="list-item"><b>CRM</b>Загрузка сделок и рабочего стола по текущей роли.</div>
          <div class="list-item"><b>Админка</b>Команда и доступы проверяются только для owner/admin.</div>
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

async function checkDashboard() {
  updateCheck('Рабочий стол', 'info', 'Проверяю nav_v2_get_dashboard...');
  try {
    const data = await rpc('nav_v2_get_dashboard', {}, 18000);
    dashboardOk = true;
    if (data.profile) currentProfile = data.profile;
    updateCheck('Рабочий стол', 'ok', `Всего сделок: ${data.summary?.total ?? '—'}. Открытых задач: ${(data.tasks || []).length}.`, `Роль: ${data.profile?.role || currentProfile?.role || '—'}`);
  } catch (e) {
    dashboardOk = false;
    updateCheck('Рабочий стол', 'error', e.message);
  }
}

async function checkProfile() {
  updateCheck('Профиль и роль', 'info', 'Проверяю текущий профиль...');
  try {
    const data = await rpc('nav_v2_get_my_profile', {}, 8000);
    currentProfile = data.profile || currentProfile || null;
    if (!currentProfile) {
      updateCheck('Профиль и роль', dashboardOk ? 'warn' : 'error', 'Профиль не найден прямым запросом.', dashboardOk ? 'Рабочий стол уже подтвердил доступ.' : '');
      return;
    }
    updateCheck('Профиль и роль', currentProfile.is_active ? 'ok' : 'warn', `Роль: ${currentProfile.role}. Статус: ${currentProfile.is_active ? 'активен' : 'выключен'}.`, currentProfile.email);
  } catch (e) {
    if (currentProfile?.role) {
      updateCheck('Профиль и роль', 'warn', 'Прямой запрос профиля не ответил вовремя, но роль уже получена через рабочий стол.', `Роль: ${currentProfile.role}`);
    } else {
      updateCheck('Профиль и роль', dashboardOk ? 'warn' : 'error', e.message, dashboardOk ? 'Рабочий стол загрузился, проверьте страницу позже.' : '');
    }
  }
}

async function checkDeals() {
  updateCheck('Список сделок', 'info', 'Проверяю nav_v2_get_deals_list...');
  try {
    const data = await rpc('nav_v2_get_deals_list', { p_limit: 20 }, 18000);
    if (data.profile) currentProfile = data.profile;
    updateCheck('Список сделок', 'ok', `Загружено сделок: ${(data.items || []).length}.`, `Роль: ${data.profile?.role || currentProfile?.role || '—'}`);
  } catch (e) {
    const status = dashboardOk ? 'warn' : 'error';
    const details = dashboardOk
      ? 'Список сделок не ответил на диагностический запрос, но рабочий стол загрузился. Возможно, временный сетевой сбой Supabase/GitHub Pages.'
      : e.message;
    updateCheck('Список сделок', status, details, e.message);
  }
}

async function checkTeam() {
  if (!['owner', 'admin'].includes(currentProfile?.role)) {
    updateCheck('Команда', 'warn', 'Раздел команды закрыт для этой роли. Это нормально: управлять пользователями может только owner/admin.', `Текущая роль: ${currentProfile?.role || '—'}`);
    return;
  }
  updateCheck('Команда', 'info', 'Проверяю список пользователей Навигатора...');
  try {
    const data = await rpc('nav_v2_list_users', {}, 15000);
    updateCheck('Команда', 'ok', `Пользователей в Навигаторе: ${(data.items || []).length}.`);
  } catch (e) {
    updateCheck('Команда', 'error', e.message);
  }
}

async function checkEdgeFunction() {
  if (!['owner', 'admin'].includes(currentProfile?.role)) {
    updateCheck('Edge Function доступа', 'warn', 'Создание ссылок доступа закрыто для этой роли. Это нормально.', `Текущая роль: ${currentProfile?.role || '—'}`);
    return;
  }
  updateCheck('Edge Function доступа', 'info', 'Проверяю доступность nav-invite-user без создания пользователя...');
  const s = session();
  if (!s?.access_token) {
    updateCheck('Edge Function доступа', 'error', 'Нет access_token.');
    return;
  }
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/nav-invite-user`, {
      method: 'OPTIONS',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(response.statusText || 'Edge Function недоступна');
    updateCheck('Edge Function доступа', 'ok', 'Функция отвечает на OPTIONS-запрос. Создание ссылки доступа проверяется отдельно на странице доступа.');
  } catch (e) {
    updateCheck('Edge Function доступа', 'error', e.message);
  }
}

async function runAllChecks() {
  checks = [];
  currentProfile = null;
  dashboardOk = false;
  render();
  updateCheck('Старт проверки', 'ok', 'Проверка запущена.');
  const user = await checkAuth();
  if (!user?.id) return;
  await checkDashboard();
  await checkProfile();
  await checkDeals();
  await checkTeam();
  await checkEdgeFunction();
  updateCheck('Старт проверки', 'ok', 'Проверка завершена.');
}

async function init() {
  setupTop('check');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  render();
}

init();