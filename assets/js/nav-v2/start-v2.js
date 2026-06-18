import { getCachedUser, getMyProfile, renderAuthBox, signOut, esc } from './supabase-v2.js';

function clearLocalNavigatorState() {
  try { localStorage.removeItem('nav_session_v2'); } catch (_) {}
  try { localStorage.removeItem('nav_last_email_v2'); } catch (_) {}
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('nav_profile_v2:'))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch (_) {}
}

function roleName(role) {
  return ({
    owner: 'Владелец',
    admin: 'Администратор',
    manager: 'Менеджер',
    spn: 'СПН',
    lawyer: 'Юрист',
    broker: 'Брокер',
    viewer: 'Просмотр'
  })[role] || role || 'роль не определена';
}

function cleanModeRequested() {
  return new URLSearchParams(location.search).get('clean') === '1';
}

if (cleanModeRequested()) {
  clearLocalNavigatorState();
  history.replaceState(null, '', './nav-v2.html');
}

function goToDashboardAfterLogin() {
  const status = document.getElementById('authStatus');
  if (status) {
    status.className = 'status ok';
    status.textContent = 'Вход выполнен. Открываю рабочий стол...';
  }
  window.location.assign('./dashboard-v2.html');
}

function renderGuest(host) {
  host.innerHTML = `<section class="start-login-wrap">
    <div class="status warn">Чистый вход очищает старую локальную сессию Навигатора и кэш профиля. Для проверки СПН используйте эту страницу в инкогнито или ссылку «Чистый вход».</div>
    <div id="startAuth"></div>
  </section>`;
  renderAuthBox(document.getElementById('startAuth'), goToDashboardAfterLogin);
}

function renderLogged(host, profile) {
  const user = getCachedUser();
  const email = profile?.email || user?.email || 'email не определён';
  const role = profile?.role || '';
  host.innerHTML = `<section class="start-auth-panel">
    <div>
      <span class="start-eyebrow">Текущая сессия</span>
      <h2>${esc(roleName(role))} в системе</h2>
      <div class="start-auth-meta">
        <span>${esc(email)}</span>
        <span>роль: ${esc(role || '—')}</span>
        <span>${profile?.is_active === false ? 'доступ выключен' : 'доступ активен'}</span>
      </div>
    </div>
    <div class="start-auth-actions">
      <a class="btn primary" href="./dashboard-v2.html">Рабочий стол</a>
      ${role === 'spn' ? '<a class="btn green" href="./spn-v2.html">Новая сделка</a>' : ''}
      <a class="btn light" href="./deals-v2.html">Сделки</a>
      <a class="btn light" href="./nav-system-check-v2.html">Проверка</a>
      <a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a>
      <button id="startLogout" class="btn light" type="button">Выйти</button>
    </div>
  </section>`;

  const logout = document.getElementById('startLogout');
  if (logout) {
    logout.onclick = async () => {
      logout.disabled = true;
      logout.textContent = 'Выхожу...';
      try { await signOut(); } catch (_) {}
      clearLocalNavigatorState();
      location.href = './nav-v2.html?clean=1';
    };
  }
}

async function renderStartAuth() {
  const host = document.getElementById('startAuthHost');
  if (!host) return;

  const user = getCachedUser();
  if (!user?.id) {
    renderGuest(host);
    return;
  }

  host.innerHTML = '<section class="start-muted-card"><h2>Проверяю вход...</h2><div class="status">Загружаю профиль пользователя.</div></section>';
  try {
    const profile = await getMyProfile({ refresh: true, timeout: 9000 });
    renderLogged(host, profile);
  } catch (error) {
    host.innerHTML = `<section class="start-auth-panel">
      <div>
        <span class="start-eyebrow">Текущая сессия</span>
        <h2>Вход найден, профиль не загрузился</h2>
        <p class="muted">${esc(error.message || error)}</p>
      </div>
      <div class="start-auth-actions">
        <a class="btn primary" href="./dashboard-v2.html">Рабочий стол</a>
        <a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a>
        <button id="startLogout" class="btn light" type="button">Выйти</button>
      </div>
    </section>`;
    const logout = document.getElementById('startLogout');
    if (logout) {
      logout.onclick = async () => {
        try { await signOut(); } catch (_) {}
        clearLocalNavigatorState();
        location.href = './nav-v2.html?clean=1';
      };
    }
  }
}

renderStartAuth();
