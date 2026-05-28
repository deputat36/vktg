import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const SESSION_KEY = 'nav_session_v2';

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
}

function writeSession(session) {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function decodeJwt(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(base64), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
  } catch (_) { return null; }
}

export function getCachedUser() {
  const session = readSession();
  if (!session?.access_token) return null;
  const payload = decodeJwt(session.access_token);
  const user = session.user || {};
  return { id: user.id || payload?.sub, email: user.email || payload?.email };
}

function headers() {
  const session = readSession();
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: 'Bearer ' + (session?.access_token || SUPABASE_PUBLISHABLE_KEY),
    'Content-Type': 'application/json'
  };
}

async function safeFetch(url, options = {}, timeout = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (error) {
    if (error.name === 'AbortError') throw new Error(`Запрос к Supabase выполнялся дольше ${Math.round(timeout / 1000)} сек. Если это было сохранение сделки, она могла успеть создаться. Проверьте список сделок и не нажимайте сохранение повторно сразу.`);
    throw new Error('Не удалось подключиться к Supabase: ' + error.message);
  } finally { clearTimeout(timer); }
}

async function parse(response) {
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = text; }
  if (!response.ok) throw new Error(payload?.message || payload?.hint || payload?.error_description || response.statusText || 'Ошибка Supabase');
  return payload;
}

async function refreshSession() {
  const session = readSession();
  if (!session?.refresh_token) { writeSession(null); return null; }
  const response = await safeFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  }, 18000);
  const payload = await parse(response);
  writeSession(payload);
  return payload;
}

export async function signIn(email, password) {
  writeSession(null);
  const response = await safeFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const session = await parse(response);
  writeSession(session);
  return session.user;
}

export async function signOut() {
  const session = readSession();
  try {
    if (session?.access_token) await safeFetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: headers() }, 10000);
  } finally { writeSession(null); }
}

export function requireUser() {
  const user = getCachedUser();
  if (!user?.id) throw new Error('Сначала войдите в систему');
  return user;
}

export async function rpc(name, payload = {}, timeout = 25000) {
  requireUser();
  let response = await safeFetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload)
  }, timeout);
  if (response.status === 401 || response.status === 403) {
    await refreshSession();
    response = await safeFetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: headers(), body: JSON.stringify(payload)
    }, timeout);
  }
  return parse(response);
}

export function navTop() {
  return `<header class="nav-v2-top"><div class="nav-v2-top-inner"><div class="nav-v2-brand"><b>CRM Навигатор сделок v2</b><span id="navUserBadge">Загрузка...</span></div><nav class="nav-v2-menu"><a href="./dashboard-v2.html">Рабочий стол</a><a href="./deals-v2.html">Сделки</a><a href="./nav-system-check-v2.html">Проверка</a><button id="navLogout" type="button">Выйти</button></nav></div></header>`;
}

export function setupTop(active) {
  document.body.insertAdjacentHTML('afterbegin', navTop(active));
  const user = getCachedUser();
  const badge = document.getElementById('navUserBadge');
  if (badge) badge.textContent = user?.email ? `Вход: ${user.email}` : 'Не авторизован';
  const out = document.getElementById('navLogout');
  if (out) out.onclick = async () => { await signOut(); location.href = './spn-v2.html'; };
}

export function renderAuthBox(target, onLogin) {
  target.innerHTML = `<section class="card auth-card"><h2>Вход в Навигатор сделок</h2><p class="muted">Используется общий Supabase Auth, но роли проекта хранятся отдельно в nav_user_profiles.</p><div class="field"><label>Email</label><input id="navEmail" type="email" autocomplete="email" value="deputat36@gmail.com"></div><div class="field"><label>Пароль</label><input id="navPassword" type="password" autocomplete="current-password"></div><div id="authStatus" class="status">Введите логин и пароль.</div><button id="navLogin" class="btn primary" type="button">Войти</button></section>`;
  document.getElementById('navLogin').onclick = async () => {
    const status = document.getElementById('authStatus');
    try {
      status.className = 'status'; status.textContent = 'Выполняю вход...';
      await signIn(document.getElementById('navEmail').value.trim(), document.getElementById('navPassword').value);
      status.className = 'status ok'; status.textContent = 'Вход выполнен.';
      await onLogin();
    } catch (error) {
      status.className = 'status error'; status.textContent = 'Ошибка входа: ' + error.message;
    }
  };
}

export function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
export function money(value) { if (value === null || value === undefined || value === '') return '—'; return Number(value).toLocaleString('ru-RU') + ' ₽'; }
export function riskPill(level) { const map = { green:['green','Обычная'], yellow:['yellow','Внимание'], red:['red','Стоп-фактор'] }; const [cls, text] = map[level] || ['blue', level || '—']; return `<span class="pill ${cls}">${text}</span>`; }
export function statusText(status) { return ({draft:'Черновик',need_info:'Нужно дозаполнить',need_lawyer:'Юрист',need_broker:'Брокер',need_documents:'Нужны документы',ready_for_deposit:'Готова к задатку',deposit_done:'Задаток внесен',preparing_deal:'Подготовка к сделке',ready_for_deal:'Готова к сделке',registration:'На регистрации',registered:'Зарегистрирована',closed:'Закрыта',cancelled:'Отменена'})[status] || status || '—'; }
