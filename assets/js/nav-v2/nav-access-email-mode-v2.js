import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const SESSION_KEY = 'nav_session_v2';

function session() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function setStatus(text, type = 'info') {
  const el = document.getElementById('status');
  if (!el) return;
  el.className = 'status ' + type;
  el.textContent = text;
}

function readPayload() {
  return {
    action: 'invite_email',
    email: document.getElementById('email')?.value?.trim() || '',
    full_name: document.getElementById('fullName')?.value?.trim() || '',
    phone: document.getElementById('phone')?.value?.trim() || null,
    role: document.getElementById('role')?.value || 'spn'
  };
}

async function sendInvite(payload) {
  const s = session();
  if (!s?.access_token) throw new Error('Сначала войдите в систему.');

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
  return data || {};
}

function renderResult(data, payload) {
  const box = document.getElementById('result');
  if (!box) return;
  box.innerHTML = `<div class="card" style="box-shadow:none;margin:14px 0;border:2px solid rgba(22,163,74,.25)">
    <h3>Приглашение отправлено</h3>
    <div class="list">
      <div class="list-item"><b>Email</b>${esc(data.email || payload.email)}</div>
      <div class="list-item"><b>Роль</b>${esc(data.role || payload.role)}</div>
    </div>
    <p class="muted">Сотрудник должен открыть письмо, перейти по ссылке и задать пароль. Если письма нет, проверьте папку «Спам».</p>
  </div>`;
}

async function handleClick(event) {
  const button = event.target?.closest?.('#createAccessLink');
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const payload = readPayload();
  if (!payload.email || !payload.email.includes('@')) {
    setStatus('Укажите корректный email сотрудника.', 'error');
    return;
  }

  try {
    button.disabled = true;
    setStatus('Отправляю приглашение на email...');
    const result = document.getElementById('result');
    if (result) result.innerHTML = '';
    const data = await sendInvite(payload);
    setStatus('Приглашение отправлено. Сотрудник должен открыть письмо и задать пароль.', 'ok');
    renderResult(data, payload);
  } catch (error) {
    setStatus('Ошибка: ' + error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function enhance() {
  const button = document.getElementById('createAccessLink');
  if (button) button.textContent = 'Отправить приглашение на email';
  const hint = document.querySelector('.auth-card .muted');
  if (hint) hint.textContent = 'Сотрудник получит письмо, откроет ссылку, задаст пароль и попадет в Навигатор. Роль хранится только в nav_user_profiles.';
}

const observer = new MutationObserver(enhance);
observer.observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('click', handleClick, true);
enhance();
