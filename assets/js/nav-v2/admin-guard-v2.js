import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const SESSION_KEY = 'nav_session_v2';

function session() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
}

async function getProfile() {
  const s = session();
  if (!s?.access_token) return null;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nav_v2_get_my_profile`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${s.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });

  if (!response.ok) return null;
  const data = await response.json();
  return data?.profile || null;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function renderNoAccess(profile) {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <main class="nav-v2-shell">
      <section class="hero">
        <h1>Нет доступа к разделу</h1>
        <p>Этот раздел доступен только owner/admin Навигатора сделок.</p>
      </section>

      <section class="card">
        <h2>Текущий профиль</h2>
        <div class="status warn">
          ${escapeHtml(profile?.email || 'Пользователь')} · роль: ${escapeHtml(profile?.role || 'не определена')}
        </div>

        <p class="muted">
          Для вашей роли открыт только рабочий функционал. Управление командой, доступами и аудитом скрыто.
        </p>

        <div class="actions" style="justify-content:flex-start">
          <a class="btn primary" href="./dashboard-v2.html">Вернуться на рабочий стол</a>
          <a class="btn light" href="./nav-system-check-v2.html">Проверка системы</a>
        </div>
      </section>
    </main>
  `;
}

async function init() {
  const profile = await getProfile();
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    renderNoAccess(profile);
  }
}

init();
