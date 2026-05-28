import { esc, getMyProfile } from './supabase-v2.js';

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

async function init() {
  try {
    const profile = await getMyProfile({ refresh: true, timeout: 12000 });
    if (!profile || !['owner', 'admin'].includes(profile.role)) {
      renderNoAccess(profile);
    }
  } catch (_) {
    renderNoAccess(null);
  }
}

init();
