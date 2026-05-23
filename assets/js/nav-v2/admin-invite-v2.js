import { setupTop, getCachedUser, renderAuthBox, esc } from './supabase-v2.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const roles = [
  ['spn','СПН'],
  ['lawyer','Юрист'],
  ['broker','Брокер'],
  ['manager','Менеджер'],
  ['viewer','Наблюдатель'],
  ['admin','Админ']
];

function session() {
  try { return JSON.parse(localStorage.getItem('nav_session_v2') || 'null'); } catch (_) { return null; }
}

function roleOptions() {
  return roles.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
}

function setStatus(text, type = 'info') {
  const el = document.getElementById('inviteStatus');
  if (el) { el.className = 'status ' + type; el.textContent = text; }
}

function render() {
  const user = getCachedUser();
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Пригласить сотрудника</h1><p>Безопасное приглашение в CRM Навигатор сделок. Роль будет сохранена только в nav_user_profiles.</p></section>
    <section class="grid">
      <div class="card">
        <h2>Новое приглашение</h2>
        <div class="field"><label>Email сотрудника</label><input id="email" type="email" placeholder="spn@example.ru"></div>
        <div class="field"><label>ФИО</label><input id="fullName" placeholder="Иванов Иван"></div>
        <div class="field"><label>Телефон</label><input id="phone" placeholder="Можно оставить пустым"></div>
        <div class="field"><label>Роль</label><select id="role">${roleOptions()}</select></div>
        <div id="inviteStatus" class="status">Вход выполнен: ${esc(user?.email || '')}. Можно отправить приглашение.</div>
        <div class="actions" style="justify-content:flex-start">
          <button id="sendInvite" class="btn green" type="button">Отправить приглашение</button>
          <a class="btn light" href="./admin-v2.html">Назад к команде</a>
        </div>
      </div>
      <div class="card">
        <h2>Важно</h2>
        <div class="list">
          <div class="list-item"><b>Пароль не создается на сайте</b>Сотрудник получит письмо и задаст доступ самостоятельно.</div>
          <div class="list-item"><b>Права проверяет сервер</b>Приглашать может только owner/admin из nav_user_profiles.</div>
          <div class="list-item"><b>CRM Лидер не затрагивается</b>Функция называется nav-invite-user и работает только с nav_user_profiles.</div>
        </div>
      </div>
    </section>
  </main>`;
  document.getElementById('sendInvite').onclick = invite;
}

async function invite() {
  const s = session();
  if (!s?.access_token) return setStatus('Сначала войдите в систему.', 'error');
  const payload = {
    email: document.getElementById('email').value.trim(),
    full_name: document.getElementById('fullName').value.trim(),
    phone: document.getElementById('phone').value.trim() || null,
    role: document.getElementById('role').value
  };
  try {
    setStatus('Отправляю приглашение...');
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
    setStatus('Приглашение отправлено. Пользователь добавлен в CRM Навигатор.', 'ok');
  } catch (e) {
    setStatus('Ошибка: ' + e.message, 'error');
  }
}

async function init() {
  setupTop('admin');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  render();
}

init();
