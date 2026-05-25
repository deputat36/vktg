import { setupTop, getCachedUser, renderAuthBox, esc } from './supabase-v2.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

function session() {
  try { return JSON.parse(localStorage.getItem('nav_session_v2') || 'null'); } catch (_) { return null; }
}

function setStatus(text, type = 'info') {
  const el = document.getElementById('status');
  if (el) { el.className = 'status ' + type; el.textContent = text; }
}

function render() {
  const user = getCachedUser();
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero">
      <h1>Временный пароль</h1>
      <p>Резервный способ доступа, если письмо Supabase не приходит. Пароль показывается один раз и не хранится в базе.</p>
    </section>
    <section class="card auth-card">
      <h2>Создать временный пароль</h2>
      <p class="muted">Доступно только owner/admin Навигатора. После входа сотруднику лучше сменить пароль самостоятельно.</p>
      <div class="status ok">Вход выполнен: ${esc(user?.email || '')}</div>
      <div class="field"><label>Email сотрудника</label><input id="email" type="email" placeholder="user@example.ru"></div>
      <div class="field"><label>ФИО</label><input id="fullName" placeholder="ФИО сотрудника"></div>
      <div class="field"><label>Телефон</label><input id="phone" placeholder="Можно оставить пустым"></div>
      <div class="field"><label>Роль</label><select id="role"><option value="spn">СПН</option><option value="lawyer">Юрист</option><option value="broker">Брокер</option><option value="manager">Менеджер</option><option value="viewer">Наблюдатель</option><option value="admin">Админ</option></select></div>
      <div id="status" class="status">Введите email существующего пользователя.</div>
      <div id="result"></div>
      <div class="actions" style="justify-content:flex-start">
        <button id="createPassword" class="btn primary" type="button">Создать временный пароль</button>
        <a class="btn light" href="./admin-v2.html">Назад к команде</a>
      </div>
    </section>
  </main>`;
  document.getElementById('createPassword').onclick = createPassword;
}

async function createPassword() {
  const s = session();
  if (!s?.access_token) return setStatus('Сначала войдите в систему.', 'error');

  const payload = {
    action: 'temp_password',
    email: document.getElementById('email').value.trim(),
    full_name: document.getElementById('fullName').value.trim(),
    phone: document.getElementById('phone').value.trim() || null,
    role: document.getElementById('role').value
  };

  try {
    setStatus('Создаю временный пароль...');
    document.getElementById('result').innerHTML = '';
    const response = await fetch(`${SUPABASE_URL}/functions/v1/nav-invite-user`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { error: text }; }
    if (!response.ok) throw new Error(data?.error || data?.message || response.statusText);

    setStatus('Временный пароль создан. Скопируйте его сейчас — потом он не будет доступен.', 'ok');
    document.getElementById('result').innerHTML = `<div class="card" style="box-shadow:none;margin:14px 0;border:2px solid rgba(22,163,74,.25)">
      <h3>Данные для входа</h3>
      <div class="list">
        <div class="list-item"><b>Email</b>${esc(data.email || payload.email)}</div>
        <div class="list-item"><b>Временный пароль</b><code style="font-size:20px;word-break:break-all">${esc(data.temporary_password || '')}</code></div>
        <div class="list-item"><b>Страница входа</b><a href="./nav-v2.html">Открыть вход</a></div>
      </div>
      <p class="muted">Передайте пароль сотруднику вручную. В базе он не хранится в открытом виде.</p>
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
