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
  const activeText = profile?.is_active === false ? 'выключен' : 'активен';
  const role = roleName(profile?.role);
  const email = profile?.email || user?.email || 'email не определён';
  const isAdmin = ['owner', 'admin'].includes(profile?.role);

  return `<section class="card" style="margin-top:18px">
    <div class="section-title">
      <div>
        <h2>Статус входа</h2>
        <p class="muted">Вы вошли в Навигатор. Можно продолжать тестирование или выйти перед проверкой другого пользователя.</p>
      </div>
      <span class="pill ${profile?.is_active === false ? 'red' : 'green'}">${esc(activeText)}</span>
    </div>
    <div class="list">
      <div class="list-item"><b>Email</b><p class="muted">${esc(email)}</p></div>
      <div class="list-item"><b>Роль</b><p class="muted">${esc(role)}${profile?.role ? ` (${esc(profile.role)})` : ''}</p></div>
    </div>
    <div class="actions" style="justify-content:flex-start;margin-top:14px">
      <a class="btn primary" href="./dashboard-v2.html">Рабочий стол</a>
      <a class="btn light" href="./nav-system-check-v2.html">Проверка системы</a>
      ${isAdmin ? '<a class="btn light" href="./nav-access-v2.html">Создать доступ</a>' : ''}
      <button id="startLogout" class="btn light" type="button">Выйти</button>
    </div>
  </section>`;
}

function guestCard() {
  return `<section id="startAuth" style="margin-top:18px"></section>`;
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

  host.innerHTML = `<section class="card" style="margin-top:18px"><h2>Статус входа</h2><div class="status">Проверяю профиль пользователя...</div></section>`;
  try {
    const profile = await getMyProfile({ refresh: true, timeout: 9000 });
    host.innerHTML = authCard(profile);
  } catch (error) {
    host.innerHTML = `<section class="card" style="margin-top:18px">
      <h2>Статус входа</h2>
      <div class="status warn">Сессия найдена, но профиль не загрузился: ${esc(error.message || error)}</div>
      <p class="muted">Можно выйти и войти заново или открыть проверку системы.</p>
      <div class="actions" style="justify-content:flex-start;margin-top:14px">
        <a class="btn light" href="./nav-system-check-v2.html">Проверка системы</a>
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
