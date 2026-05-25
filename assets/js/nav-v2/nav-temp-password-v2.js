import { setupTop, getCachedUser, renderAuthBox, esc } from './supabase-v2.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const SESSION_KEY = 'nav_session_v2';

function session() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
}

function writeSession(value) {
  if (!value) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(value));
}

async function refreshSession() {
  const s = session();
  if (!s?.refresh_token) throw new Error('Сессия устарела. Выйдите и войдите снова.');

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token })
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { error: text }; }
  if (!response.ok) throw new Error(data?.error_description || data?.message || data?.error || response.statusText);
  writeSession(data);
  return data;
}

function setStatus(text, type = 'info') {
  const el = document.getElementById('status');
  if (el) { el.className = 'status ' + type; el.textContent = text; }
}

function render() {
  const user = getCachedUser();
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero">
      <h1>Ссылка доступа</h1>
      <p>Основной способ дать сотруднику доступ без зависимости от почты. Ссылка показывается на экране, ее можно передать вручную.</p>
    </section>
    <section class="card auth-card">
      <h2>Создать одноразовую ссылку доступа</h2>
      <p class="muted">Для уже существующего пользователя Supabase Auth. Сотрудник откроет ссылку, задаст пароль и попадет в Навигатор.</p>
      <div class="status ok">Вход выполнен: ${esc(user?.email || '')}</div>
      <div class="field"><label>Email сотрудника</label><input id="email" type="email" placeholder="user@example.ru"></div>
      <div class="field"><label>ФИО</label><input id="fullName" placeholder="ФИО сотрудника"></div>
      <div class="field"><label>Телефон</label><input id="phone" placeholder="Можно оставить пустым"></div>
      <div class="field"><label>Роль</label><select id="role"><option value="spn">СПН</option><option value="lawyer">Юрист</option><option value="broker">Брокер</option><option value="manager">Менеджер</option><option value="viewer">Наблюдатель</option><option value="admin">Админ</option></select></div>
      <div id="status" class="status">Введите email существующего пользователя.</div>
      <div id="result"></div>
      <div class="actions" style="justify-content:flex-start">
        <button id="createAccessLink" class="btn primary" type="button">Создать ссылку доступа</button>
        <a class="btn light" href="./admin-v2.html">Назад к команде</a>
        <button id="refreshLogin" class="btn light" type="button">Обновить вход</button>
      </div>
    </section>
  </main>`;
  document.getElementById('createAccessLink').onclick = createAccessLink;
  document.getElementById('refreshLogin').onclick = async () => {
    try {
      setStatus('Обновляю сессию...');
      await refreshSession();
      setStatus('Сессия обновлена. Можно создать ссылку доступа.', 'ok');
    } catch (e) {
      setStatus('Не удалось обновить сессию: ' + e.message, 'error');
    }
  };
}

async function callAccessLink(payload) {
  const s = session();
  if (!s?.access_token) throw new Error('Сначала войдите в систему.');
  return fetch(`${SUPABASE_URL}/functions/v1/nav-invite-user`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${s.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { error: text }; }
  if (!response.ok) throw new Error(data?.error || data?.message || response.statusText);
  return data;
}

async function createAccessLink() {
  const payload = {
    action: 'access_link',
    email: document.getElementById('email').value.trim(),
    full_name: document.getElementById('fullName').value.trim(),
    phone: document.getElementById('phone').value.trim() || null,
    role: document.getElementById('role').value
  };

  try {
    setStatus('Создаю одноразовую ссылку доступа...');
    document.getElementById('result').innerHTML = '';
    let response = await callAccessLink(payload);
    if (response.status === 401 || response.status === 403) {
      setStatus('Сессия устарела. Обновляю вход и повторяю запрос...');
      await refreshSession();
      response = await callAccessLink(payload);
    }
    const data = await parseResponse(response);
    if (!data.action_link) throw new Error('Supabase не вернул ссылку доступа. Попробуйте отправить обычное приглашение.');
    setStatus('Ссылка доступа создана. Скопируйте и передайте сотруднику.', 'ok');
    document.getElementById('result').innerHTML = `<div class="card" style="box-shadow:none;margin:14px 0;border:2px solid rgba(22,163,74,.25)">
      <h3>Одноразовая ссылка доступа</h3>
      <div class="list">
        <div class="list-item"><b>Email</b>${esc(data.email || payload.email)}</div>
        <div class="list-item"><b>Роль</b>${esc(data.role || payload.role)}</div>
        <div class="list-item"><b>Ссылка</b><textarea readonly style="min-height:120px">${esc(data.action_link)}</textarea></div>
      </div>
      <div class="actions" style="justify-content:flex-start"><a class="btn primary" href="${esc(data.action_link)}">Открыть ссылку</a></div>
      <p class="muted">Ссылка одноразовая. Сотрудник откроет ее, задаст пароль и войдет в Навигатор.</p>
    </div>`;
  } catch (error) {
    setStatus('Ошибка: ' + error.message, 'error');
  }
}

async function init() {
  setupTop('admin');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  render();
}

init();
