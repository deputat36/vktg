import { getCachedUser, getMyProfile, renderAuthBox, signOut, esc } from './supabase-v2.js';

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

function authCard(profile = null) {
  const user = getCachedUser();
  const isActive = profile?.is_active !== false;
  const role = roleName(profile?.role);
  const email = profile?.email || user?.email || 'email не определён';

  return `<section class="start-auth-panel">
    <div>
      <span class="start-eyebrow">Текущая сессия</span>
      <h2>${esc(role)} в системе</h2>
      <div class="start-auth-meta">
        <span>${esc(email)}</span>
        <span>роль: ${esc(profile?.role || '—')}</span>
        <span>${isActive ? 'доступ активен' : 'доступ выключен'}</span>
      </div>
    </div>
    <div class="start-auth-actions">
      <a class="btn primary" href="./dashboard-v2.html">Рабочий стол</a>
      <a class="btn light" href="./nav-system-check-v2.html">Проверка</a>
      <button id="startLogout" class="btn light" type="button">Выйти</button>
    </div>
  </section>`;
}

function guestCard() {
  return `<section class="start-login-wrap"><div id="startAuth"></div></section>`;
}

async function renderStartAuth() {
  const host = document.getElementById('startAuthHost');
  if (!host) return;

  const user = getCachedUser();
  if (!user?.id) {
    host.innerHTML = guestCard();
    renderAuthBox(document.getElementById('startAuth'), () => location.reload());
    return;
  }

  host.innerHTML = `<section class="start-muted-card"><h2>Проверяю вход...</h2><div class="status">Загружаю профиль пользователя.</div></section>`;
  try {
    const profile = await getMyProfile({ refresh: true, timeout: 9000 });
    host.innerHTML = authCard(profile);
  } catch (error) {
    host.innerHTML = `<section class="start-auth-panel">
      <div>
        <span class="start-eyebrow">Текущая сессия</span>
        <h2>Вход найден, профиль не загрузился</h2>
        <p class="muted">${esc(error.message || error)}</p>
      </div>
      <div class="start-auth-actions">
        <a class="btn light" href="./nav-system-check-v2.html">Проверка</a>
        <button id="startLogout" class="btn light" type="button">Выйти</button>
      </div>
    </section>`;
  }

  const logout = document.getElementById('startLogout');
  if (logout) logout.onclick = async () => {
    logout.disabled = true;
    logout.textContent = 'Выхожу...';
    await signOut();
    location.reload();
  };
}

renderStartAuth();
