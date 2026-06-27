import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';

const app = document.getElementById('app');
const page = document.body.dataset.adminPage || 'admin';

const scripts = {
  admin: './admin-v2.js?v=20260627-1500',
  invite: './admin-invite-v2.js?v=20260617-43',
  access: './nav-temp-password-v2.js?v=20260617-43',
  audit: './nav-access-audit-v2.js?v=20260617-43'
};

function ensureTop() {
  if (!document.querySelector('.nav-v2-top')) setupTop('admin');
}

function noAccess(profile) {
  ensureTop();
  app.innerHTML = `
    <main class="nav-v2-shell">
      <section class="hero">
        <h1>Нет доступа к разделу</h1>
        <p>Этот раздел доступен только owner/admin Навигатора сделок.</p>
      </section>

      <section class="card">
        <h2>Текущий профиль</h2>
        <div class="status warn">
          ${esc(profile?.email || 'Пользователь')} · роль: ${esc(profile?.role || 'не определена')}
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

function isLoadFallbackError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return text.includes('сначала войдите')
    || text.includes('ошибка supabase 400')
    || text.includes('ошибка supabase 401')
    || text.includes('jwt expired')
    || text.includes('unauthorized')
    || text.includes('refresh');
}

function renderLoginAfterAdminError() {
  app.innerHTML = '<main class="nav-v2-shell"><div id="adminAuthHost"></div></main>';
  renderAuthBox(document.getElementById('adminAuthHost'), async () => location.reload());
  const status = document.getElementById('authStatus');
  if (status) {
    status.className = 'status warn';
    status.textContent = 'Нужно войти снова, чтобы открыть административный раздел.';
  }
}

async function init() {
  if (!getCachedUser()) {
    return renderAuthBox(app, async () => location.reload());
  }

  app.innerHTML = `
    <main class="nav-v2-shell">
      <div class="status">Проверяю доступ...</div>
    </main>
  `;

  try {
    const data = await rpc('nav_v2_get_my_profile', {}, 12000);
    const profile = data?.profile || null;

    if (!['owner', 'admin'].includes(profile?.role)) {
      return noAccess(profile);
    }

    await import(scripts[page] || scripts.admin);
  } catch (e) {
    if (isLoadFallbackError(e)) {
      renderLoginAfterAdminError();
      return;
    }
    noAccess({ role: 'не определена', email: '' });
  }
}

init();
