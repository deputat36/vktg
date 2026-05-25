import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const SESSION_KEY = 'nav_session_v2';
const app = document.getElementById('app');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function setStatus(text, type = 'info') {
  const el = document.getElementById('status');
  if (el) {
    el.className = 'status ' + type;
    el.textContent = text;
  }
}

function readHashParams() {
  const raw = window.location.hash ? window.location.hash.slice(1) : '';
  return new URLSearchParams(raw);
}

function readQueryParams() {
  return new URLSearchParams(window.location.search || '');
}

function writeSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function callAuth(path, body) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = { message: text }; }
  if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || data?.error || response.statusText);
  return data;
}

function getTokensFromUrl() {
  const hash = readHashParams();
  const query = readQueryParams();
  return {
    access_token: hash.get('access_token') || query.get('access_token'),
    refresh_token: hash.get('refresh_token') || query.get('refresh_token'),
    type: hash.get('type') || query.get('type'),
    token_hash: hash.get('token_hash') || query.get('token_hash')
  };
}

function renderForm(email = '') {
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero">
      <h1>Принять приглашение</h1>
      <p>Создайте пароль для входа в CRM «Навигатор сделок v2».</p>
    </section>
    <section class="card auth-card">
      <h2>Завершение регистрации</h2>
      <p class="muted">После установки пароля вы будете перенаправлены на рабочий стол Навигатора.</p>
      ${email ? `<div class="status ok">Email: ${esc(email)}</div>` : ''}
      <div class="field"><label>Новый пароль</label><input id="password" type="password" autocomplete="new-password" placeholder="Минимум 6 символов"></div>
      <div class="field"><label>Повторите пароль</label><input id="password2" type="password" autocomplete="new-password"></div>
      <div id="status" class="status">Введите пароль и нажмите кнопку.</div>
      <button id="savePassword" class="btn primary" type="button">Создать пароль и войти</button>
    </section>
  </main>`;
  document.getElementById('savePassword').onclick = savePassword;
}

async function savePassword() {
  const password = document.getElementById('password').value;
  const password2 = document.getElementById('password2').value;
  if (password.length < 6) return setStatus('Пароль должен быть не короче 6 символов.', 'error');
  if (password !== password2) return setStatus('Пароли не совпадают.', 'error');

  const tokens = getTokensFromUrl();
  if (!tokens.access_token) {
    setStatus('В ссылке нет access_token. Запросите новое приглашение.', 'error');
    return;
  }

  try {
    setStatus('Сохраняю пароль...');
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });
    const text = await response.text();
    let user = null;
    try { user = text ? JSON.parse(text) : null; } catch (_) { user = null; }
    if (!response.ok) throw new Error(user?.msg || user?.message || user?.error_description || response.statusText);

    writeSession({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: 'bearer',
      user
    });

    setStatus('Пароль создан. Открываю рабочий стол...', 'ok');
    history.replaceState(null, '', './nav-accept-invite-v2.html');
    setTimeout(() => location.href = './dashboard-v2.html', 800);
  } catch (error) {
    setStatus('Ошибка: ' + error.message, 'error');
  }
}

async function init() {
  const tokens = getTokensFromUrl();

  if (tokens.access_token) {
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${tokens.access_token}`
        }
      });
      const user = response.ok ? await response.json() : null;
      renderForm(user?.email || '');
      return;
    } catch (_) {
      renderForm('');
      return;
    }
  }

  if (tokens.token_hash) {
    app.innerHTML = `<main class="nav-v2-shell"><section class="card"><h1>Проверяю приглашение...</h1><div id="status" class="status">Подождите несколько секунд.</div></section></main>`;
    try {
      const data = await callAuth('/auth/v1/verify', {
        type: tokens.type || 'invite',
        token_hash: tokens.token_hash
      });
      const session = data?.session || data;
      if (!session?.access_token) throw new Error('Supabase не вернул сессию приглашения');
      writeSession(session);
      location.href = `./nav-accept-invite-v2.html#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token || '')}&type=invite`;
    } catch (error) {
      setStatus('Ошибка приглашения: ' + error.message, 'error');
    }
    return;
  }

  app.innerHTML = `<main class="nav-v2-shell"><section class="card auth-card"><h1>Ссылка приглашения не найдена</h1><p class="muted">Откройте страницу из письма Supabase или запросите новое приглашение.</p><a class="btn light" href="./nav-v2.html">Перейти ко входу</a></section></main>`;
}

init();
