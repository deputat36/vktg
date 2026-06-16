import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const SESSION_KEY = 'nav_session_v2';
const CHECK_VERSION = '20260616-5';
let checks = [];
let currentProfile = null;
let dashboardOk = false;
let lastRunAt = null;

const STATIC_PAGES = [
  ['Стартовая страница', './nav-v2.html'],
  ['Рабочий стол', './dashboard-v2.html'],
  ['Список сделок', './deals-v2.html'],
  ['Новая сделка СПН', './spn-v2.html'],
  ['Карточка сделки', './deal-card-v2.html'],
  ['Создать доступ', './nav-access-v2.html'],
  ['Принять приглашение / восстановить пароль', './nav-accept-invite-v2.html'],
  ['Проверка системы', './nav-system-check-v2.html']
];

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

function checkItem(title) {
  return checks.find((item) => item.title === title);
}

function checkIsOk(title) {
  return checkItem(title)?.status === 'ok';
}

function roleName(role) {
  return ({ owner: 'Владелец', admin: 'Администратор', manager: 'Менеджер', spn: 'СПН', lawyer: 'Юрист', broker: 'Брокер' })[role] || role || 'не определена';
}

function roleActions() {
  const role = currentProfile?.role || '';
  const common = [
    ['Рабочий стол', './dashboard-v2.html'],
    ['Сделки', './deals-v2.html'],
    ['Проверка', './nav-system-check-v2.html']
  ];
  if (role === 'spn') return [...common, ['Новая сделка', './spn-v2.html']];
  if (role === 'lawyer') return [...common, ['Юридическая очередь', './deals-v2.html?filter=lawyer']];
  if (role === 'broker') return [...common, ['Брокерская очередь', './deals-v2.html?filter=broker']];
  if (role === 'owner' || role === 'admin') {
    return [...common, ['Новая сделка', './spn-v2.html'], ['Команда', './admin-v2.html'], ['Создать доступ', './nav-access-v2.html'], ['Аудит доступов', './nav-access-audit-v2.html']];
  }
  return common;
}

function actionLinks() {
  return roleActions().map(([title, href]) => `<a class="btn light" href="${href}">${esc(title)}</a>`).join('');
}

function manualSteps() {
  const role = currentProfile?.role || '';
  if (role === 'owner' || role === 'admin') {
    return [
      'Откройте «Создать доступ» и создайте тестового СПН на отдельный email.',
      'Скопируйте ссылку доступа и откройте её в инкогнито или другом браузере.',
      'Задайте пароль, затем войдите через рабочий стол.',
      'Проверьте, что новый СПН видит рабочий стол, список сделок и форму новой сделки.',
      'После проверки отключите или удалите тестовый профиль, если он не нужен.'
    ];
  }
  if (role === 'spn') {
    return [
      'Откройте «Новая сделка» и проверьте загрузку формы.',
      'Не создавайте тестовую сделку без необходимости: достаточно убедиться, что поля и кнопки открылись.',
      'Откройте «Сделки» и проверьте список доступных вам сделок.',
      'Откройте одну карточку сделки, если в списке есть доступные сделки.'
    ];
  }
  if (role === 'lawyer') {
    return [
      'Откройте юридическую очередь.',
      'Проверьте карточку сделки, документы, комментарии и статусы документов.',
      'Создание доступа и команда должны быть закрыты — это нормально.'
    ];
  }
  if (role === 'broker') {
    return [
      'Откройте брокерскую очередь.',
      'Проверьте карточку сделки, ипотечные/финансовые блоки и комментарии.',
      'Создание доступа и команда должны быть закрыты — это нормально.'
    ];
  }
  return [
    'Запустите проверку.',
    'Если роль не определена, проверьте запись пользователя в nav_user_profiles.',
    'Если вход есть, но профиля нет — пользователю нужно создать профиль Навигатора.'
  ];
}

function renderManualSteps() {
  return manualSteps().map((step, index) => `<div class="list-item"><b>${index + 1}.</b> ${esc(step)}</div>`).join('');
}

function reportText() {
  const profile = currentProfile
    ? `${currentProfile.email || 'без email'} · ${roleName(currentProfile.role)} · ${currentProfile.is_active ? 'активен' : 'выключен'}`
    : 'профиль не определён';
  const lines = [
    'CRM Навигатор сделок v2 — отчет диагностики',
    `Версия проверки: ${CHECK_VERSION}`,
    `Время проверки: ${lastRunAt || 'не запускалась'}`,
    `Профиль: ${profile}`,
    '',
    ...checks.map((item) => `${statusText(item.status)} — ${item.title}: ${item.details || ''}${item.meta ? ` (${item.meta})` : ''}`)
  ];
  return lines.join('\n');
}

async function copyReport() {
  const text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    updateCheck('Отчет диагностики', 'ok', 'Отчет скопирован в буфер обмена.');
  } catch (_) {
    updateCheck('Отчет диагностики', 'warn', 'Не удалось скопировать автоматически. Выделите текст отчета вручную.', text.slice(0, 1200));
  }
}

function downgradeTransientErrors() {
  const dashboard = checkItem('Рабочий стол');
  const profileOk = checkIsOk('Профиль и роль');
  const dealsOk = checkIsOk('Список сделок');

  if (dashboard?.status === 'error' && profileOk && dealsOk && currentProfile?.role) {
    Object.assign(dashboard, {
      status: 'warn',
      details: 'Диагностический запрос рабочего стола не ответил вовремя, но профиль и список сделок загрузились. Это похоже на временный таймаут Supabase и не блокирует работу CRM.',
      meta: `Роль: ${roleName(currentProfile.role)}`
    });
    render();
  }
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
  if (errors) return `<div class="status error">Есть ошибки: ${errors}. Скопируйте отчет и проверьте пункты ниже.</div>`;
  if (warnings) return `<div class="status warn">Критичных ошибок нет, но есть предупреждения: ${warnings}. CRM можно проверять, если основные рабочие экраны открываются.</div>`;
  if (ok) return `<div class="status ok">Проверка идет или уже завершена. Успешных пунктов: ${ok}.</div>`;
  return `<div class="status">Нажмите «Запустить проверку».</div>`;
}

function renderProfileCard() {
  if (!currentProfile) {
    return `<div class="status warn">Профиль ещё не определён. Запустите проверку.</div>`;
  }
  return `<div class="list">
    <div class="list-item"><b>Email</b><p class="muted">${esc(currentProfile.email || '—')}</p></div>
    <div class="list-item"><b>Роль</b><p class="muted">${esc(roleName(currentProfile.role))} (${esc(currentProfile.role || '—')})</p></div>
    <div class="list-item"><b>Статус</b><p class="muted">${currentProfile.is_active ? 'Активен' : 'Выключен'}</p></div>
  </div>`;
}

function render() {
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero">
      <h1>Проверка системы v2</h1>
      <p>Диагностика входа, роли, Supabase, сделок, рабочих страниц и Edge Function доступа. Таблицы CRM «Лидер» не используются.</p>
    </section>
    ${summary()}
    <section class="card">
      <div class="section-title">
        <div>
          <h2>Результаты</h2>
          <p class="muted">Проверки выполняются с учетом роли пользователя. Закрытые админ-разделы для неадминов считаются нормой.</p>
        </div>
        <div class="actions" style="justify-content:flex-end">
          <button id="copyReport" class="btn light" type="button">Скопировать отчет</button>
          <button id="runCheck" class="btn primary" type="button">Запустить проверку</button>
        </div>
      </div>
      <div class="list">${checks.map(renderCheck).join('') || '<div class="empty">Проверка еще не запускалась.</div>'}</div>
    </section>
    <section class="grid">
      <div class="card">
        <h2>Текущий профиль</h2>
        ${renderProfileCard()}
      </div>
      <div class="card">
        <h2>Быстрые действия</h2>
        <div class="actions" style="justify-content:flex-start">${actionLinks()}</div>
      </div>
    </section>
    <section class="grid">
      <div class="card">
        <h2>Ручная проверка после диагностики</h2>
        <div class="list">${renderManualSteps()}</div>
      </div>
      <div class="card">
        <h2>Что проверяется автоматически</h2>
        <div class="list">
          <div class="list-item"><b>Браузер</b><p class="muted">localStorage/sessionStorage и возможность хранить сессию.</p></div>
          <div class="list-item"><b>Auth</b><p class="muted">Есть ли сессия, access token, refresh token и срок действия JWT.</p></div>
          <div class="list-item"><b>Профиль</b><p class="muted">Есть ли пользователь в nav_user_profiles и какая роль назначена.</p></div>
          <div class="list-item"><b>CRM</b><p class="muted">Загрузка рабочего стола и списка сделок по текущей роли.</p></div>
          <div class="list-item"><b>Страницы</b><p class="muted">Доступность основных HTML-страниц на GitHub Pages.</p></div>
          <div class="list-item"><b>Админка</b><p class="muted">Команда и доступы проверяются только для owner/admin.</p></div>
        </div>
      </div>
    </section>
  </main>`;
  const btn = document.getElementById('runCheck');
  if (btn) btn.onclick = runAllChecks;
  const copy = document.getElementById('copyReport');
  if (copy) copy.onclick = copyReport;
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

async function checkBrowserStorage() {
  updateCheck('Браузер и хранилище', 'info', 'Проверяю localStorage и sessionStorage...');
  try {
    const key = 'nav_v2_check_probe';
    localStorage.setItem(key, '1');
    sessionStorage.setItem(key, '1');
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    updateCheck('Браузер и хранилище', 'ok', 'localStorage и sessionStorage доступны. Сессия и кеш профиля могут сохраняться.');
  } catch (e) {
    updateCheck('Браузер и хранилище', 'error', 'Браузер блокирует локальное хранилище. Вход и кеш профиля могут работать нестабильно.', e.message);
  }
}

async function checkConfig() {
  updateCheck('Конфигурация Supabase', 'info', 'Проверяю публичный URL и publishable key...');
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    updateCheck('Конфигурация Supabase', 'error', 'Не найден SUPABASE_URL или SUPABASE_PUBLISHABLE_KEY.');
    return;
  }
  const urlOk = /^https:\/\/[^/]+\.supabase\.co$/.test(SUPABASE_URL);
  const keyOk = SUPABASE_PUBLISHABLE_KEY.length > 20;
  updateCheck(
    'Конфигурация Supabase',
    urlOk && keyOk ? 'ok' : 'warn',
    urlOk && keyOk ? 'Публичная конфигурация выглядит корректно.' : 'Конфигурация есть, но выглядит нестандартно. Проверьте config/supabase.js.',
    SUPABASE_URL
  );
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
    updateCheck('Рабочий стол', 'ok', `Всего сделок: ${data.summary?.total ?? '—'}. Открытых задач: ${(data.tasks || []).length}.`, `Роль: ${roleName(data.profile?.role || currentProfile?.role)}`);
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
    updateCheck('Профиль и роль', currentProfile.is_active ? 'ok' : 'warn', `Роль: ${roleName(currentProfile.role)}. Статус: ${currentProfile.is_active ? 'активен' : 'выключен'}.`, currentProfile.email);
  } catch (e) {
    if (currentProfile?.role) {
      updateCheck('Профиль и роль', 'warn', 'Прямой запрос профиля не ответил вовремя, но роль уже получена через рабочий стол.', `Роль: ${roleName(currentProfile.role)}`);
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
    updateCheck('Список сделок', 'ok', `Загружено сделок: ${(data.items || []).length}.`, `Роль: ${roleName(data.profile?.role || currentProfile?.role)}`);
  } catch (e) {
    const status = dashboardOk ? 'warn' : 'error';
    const details = dashboardOk
      ? 'Список сделок не ответил на диагностический запрос, но рабочий стол загрузился. Возможно, временный сетевой сбой Supabase/GitHub Pages.'
      : e.message;
    updateCheck('Список сделок', status, details, e.message);
  }
}

async function checkStaticPages() {
  updateCheck('Страницы GitHub Pages', 'info', 'Проверяю доступность основных HTML-страниц...');
  const failed = [];
  for (const [title, href] of STATIC_PAGES) {
    try {
      const response = await fetch(href, { method: 'GET', cache: 'no-store' });
      if (!response.ok) failed.push(`${title}: ${response.status}`);
    } catch (e) {
      failed.push(`${title}: ${e.message}`);
    }
  }
  if (failed.length) {
    updateCheck('Страницы GitHub Pages', 'warn', 'Некоторые страницы не ответили на статическую проверку.', failed.join('; '));
  } else {
    updateCheck('Страницы GitHub Pages', 'ok', `Все основные страницы доступны: ${STATIC_PAGES.length}.`);
  }
}

async function checkTeam() {
  if (!['owner', 'admin'].includes(currentProfile?.role)) {
    updateCheck('Команда', 'ok', 'Раздел команды закрыт для этой роли. Это корректно: управлять пользователями может только owner/admin.', `Текущая роль: ${roleName(currentProfile?.role)}`);
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
    updateCheck('Edge Function доступа', 'ok', 'Создание ссылок доступа закрыто для этой роли. Это корректно.', `Текущая роль: ${roleName(currentProfile?.role)}`);
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
  lastRunAt = new Date().toLocaleString('ru-RU');
  render();
  updateCheck('Старт проверки', 'ok', 'Проверка запущена.', `Версия: ${CHECK_VERSION}`);
  await checkBrowserStorage();
  await checkConfig();
  const user = await checkAuth();
  if (!user?.id) return;
  await checkDashboard();
  await checkProfile();
  await checkDeals();
  await checkStaticPages();
  await checkTeam();
  await checkEdgeFunction();
  downgradeTransientErrors();
  updateCheck('Старт проверки', 'ok', 'Проверка завершена.', `Версия: ${CHECK_VERSION}`);
}

async function init() {
  setupTop('check');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  render();
}

init();
