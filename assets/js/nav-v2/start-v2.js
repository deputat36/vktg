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

function linkCard(item) {
  const cls = ['start-link', item.variant || ''].filter(Boolean).join(' ');
  return `<a class="${cls}" href="${esc(item.href)}">
    <b>${esc(item.title)}</b>
    <span>${esc(item.text)}</span>
    <strong>${esc(item.action)}</strong>
  </a>`;
}

function linksForRole(role) {
  const common = [
    { title: 'Рабочий стол', text: 'Сводка по сделкам, задачам и очередям.', href: './dashboard-v2.html', action: 'Открыть', variant: 'primary' },
    { title: 'Сделки', text: role === 'spn' ? 'Ваши доступные сделки и карточки.' : 'Список сделок и переход в карточки.', href: './deals-v2.html', action: 'Смотреть' },
    { title: 'Проверка системы', text: 'Диагностика входа, роли, RPC, страниц и Edge Function.', href: './nav-system-check-v2.html', action: 'Проверить' }
  ];

  if (role === 'spn') {
    return [
      common[0],
      { title: 'Новая сделка', text: 'Форма создания сделки для СПН.', href: './spn-v2.html', action: 'Создать', variant: 'green' },
      common[1],
      common[2]
    ];
  }

  if (role === 'lawyer') {
    return [
      common[0],
      { title: 'Юридическая очередь', text: 'Сделки и документы для юридической проверки.', href: './deals-v2.html?filter=lawyer', action: 'Открыть' },
      common[2]
    ];
  }

  if (role === 'broker') {
    return [
      common[0],
      { title: 'Брокерская очередь', text: 'Сделки и задачи по ипотеке/финансам.', href: './deals-v2.html?filter=broker', action: 'Открыть' },
      common[2]
    ];
  }

  if (role === 'manager') {
    return [
      common[0],
      { title: 'Сделки команды', text: 'Сделки и контроль работы своей команды.', href: './deals-v2.html', action: 'Смотреть' },
      common[2]
    ];
  }

  if (role === 'owner' || role === 'admin') {
    return [
      common[0],
      { title: 'Новая сделка', text: 'Форма создания сделки для СПН или теста.', href: './spn-v2.html', action: 'Создать' },
      common[1],
      { title: 'Создать доступ', text: 'Ссылка доступа или письмо для нового сотрудника.', href: './nav-access-v2.html', action: 'Создать', variant: 'green' },
      { title: 'Команда', text: 'Пользователи, роли, менеджеры и статусы.', href: './admin-v2.html', action: 'Управлять' },
      { title: 'Аудит доступов', text: 'Проверка действий по доступам и пользователям.', href: './nav-access-audit-v2.html', action: 'Открыть' },
      common[2]
    ];
  }

  return common;
}

function renderLinks(profile) {
  const host = document.getElementById('startLinksHost');
  if (!host) return;
  const role = profile?.role || '';
  host.innerHTML = linksForRole(role).map(linkCard).join('');
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
    renderLinks(null);
    host.innerHTML = guestCard();
    renderAuthBox(document.getElementById('startAuth'), () => location.reload());
    return;
  }

  host.innerHTML = `<section class="start-muted-card"><h2>Проверяю вход...</h2><div class="status">Загружаю профиль пользователя.</div></section>`;
  try {
    const profile = await getMyProfile({ refresh: true, timeout: 9000 });
    host.innerHTML = authCard(profile);
    renderLinks(profile);
  } catch (error) {
    renderLinks(null);
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
