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

if (new URLSearchParams(location.search).get('clean') === '1') {
  clearLocalNavigatorState();
  history.replaceState(null, '', './nav-v2.html');
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

function linkCard(item) {
  const cls = ['start-link', item.variant || ''].filter(Boolean).join(' ');
  return `<a class="${cls}" href="${esc(item.href)}">
    <b>${esc(item.title)}</b>
    <span>${esc(item.text)}</span>
    <strong>${esc(item.action)}</strong>
  </a>`;
}\n
function focusForRole(role) {
  if (role === 'owner' || role === 'admin') {
    return {
      eyebrow: 'Главная задача сейчас',
      title: 'Проверить доступ СПН',
      text: 'Создайте тестовый доступ, откройте ссылку в инкогнито и убедитесь, что новый СПН видит только свои рабочие разделы.',
      note: 'Ссылку доступа открываем только в инкогнито, чтобы не смешать сессию владельца и тестового СПН.',
      actions: [
        { title: 'Создать тестовый доступ', href: './nav-access-v2.html', cls: 'btn green' },
        { title: 'Проверка системы', href: './nav-system-check-v2.html', cls: 'btn light' }
      ]
    };
  }
  if (role === 'spn') {
    return {
      eyebrow: 'Рабочий сценарий СПН',
      title: 'Проверить рабочие разделы',
      text: 'Откройте рабочий стол, список сделок и форму новой сделки. Админские разделы должны быть скрыты или закрыты.',
      note: 'Если кнопки команды, аудита или создания доступов не отображаются — это корректно для роли СПН.',
      actions: [
        { title: 'Рабочий стол', href: './dashboard-v2.html', cls: 'btn primary' },
        { title: 'Новая сделка', href: './spn-v2.html', cls: 'btn green' },
        { title: 'Проверка системы', href: './nav-system-check-v2.html', cls: 'btn light' }
      ]
    };
  }
  if (role === 'lawyer') {
    return {
      eyebrow: 'Рабочий сценарий юриста',
      title: 'Проверить юридическую очередь',
      text: 'Откройте сделки на юридическую проверку и карточку сделки. Админские разделы должны быть закрыты.',
      note: 'Для юриста основной фокус — риски, документы и юридические комментарии.',
      actions: [
        { title: 'Юридическая очередь', href: './deals-v2.html?filter=lawyer', cls: 'btn primary' },
        { title: 'Проверка системы', href: './nav-system-check-v2.html', cls: 'btn light' }
      ]
    };
  }
  if (role === 'broker') {
    return {
      eyebrow: 'Рабочий сценарий брокера',
      title: 'Проверить брокерскую очередь',
      text: 'Откройте сделки по ипотеке/финансам и проверьте карточку сделки. Админские разделы должны быть закрыты.',
      note: 'Для брокера основной фокус — ипотечные и финансовые задачи.',
      actions: [
        { title: 'Брокерская очередь', href: './deals-v2.html?filter=broker', cls: 'btn primary' },
        { title: 'Проверка системы', href: './nav-system-check-v2.html', cls: 'btn light' }
      ]
    };
  }
  if (role === 'manager') {
    return {
      eyebrow: 'Рабочий сценарий менеджера',
      title: 'Проверить сделки команды',
      text: 'Откройте рабочий стол и сделки команды. Управление доступами доступно только owner/admin.',
      note: 'Если сотрудник команды не отображается, проверьте привязку менеджера в профиле.',
      actions: [
        { title: 'Рабочий стол', href: './dashboard-v2.html', cls: 'btn primary' },
        { title: 'Сделки команды', href: './deals-v2.html', cls: 'btn light' }
      ]
    };
  }
  return {
    eyebrow: 'Вход в Навигатор',
    title: 'Войдите для продолжения',
    text: 'После входа стартовая страница покажет нужные разделы именно для вашей роли.',
    note: 'Если доступа нет, запросите ссылку у руководителя.',
    actions: [
      { title: 'Перейти ко входу', href: './nav-v2.html', cls: 'btn primary' },
      { title: 'Проверка системы', href: './nav-system-check-v2.html', cls: 'btn light' }
    ]
  };
}

function renderFocus(profile) {
  const host = document.querySelector('.start-focus');
  if (!host) return;
  const data = focusForRole(profile?.role || '');
  host.innerHTML = `<span class="start-eyebrow">${esc(data.eyebrow)}</span>
    <h2>${esc(data.title)}</h2>
    <p class="muted">${esc(data.text)}</p>
    <div class="actions" style="justify-content:flex-start">
      ${data.actions.map((item) => `<a class="${esc(item.cls)}" href="${esc(item.href)}">${esc(item.title)}</a>`).join('')}
    </div>
    <div class="start-note">${esc(data.note)}</div>`;
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
      <a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a>
      <button id="startLogout" class="btn light" type="button">Выйти</button>
    </div>
  </section>`;
}

function guestCard() {
  return `<section class="start-login-wrap"><div class="status warn">Для проверки СПН лучше открыть эту страницу с параметром clean=1 или в инкогнито. Это убирает старые локальные сессии и автокеш профиля.</div><div id="startAuth"></div></section>`;
}

function goToDashboardAfterLogin() {
  const status = document.getElementById('authStatus');
  if (status) {
    status.className = 'status ok';
    status.textContent = 'Вход выполнен. Открываю рабочий стол...';
  }
  window.location.assign('./dashboard-v2.html');
}

async function renderStartAuth() {
  const host = document.getElementById('startAuthHost');
  if (!host) return;

  const user = getCachedUser();
  if (!user?.id) {
    renderFocus(null);
    renderLinks(null);
    host.innerHTML = guestCard();
    renderAuthBox(document.getElementById('startAuth'), goToDashboardAfterLogin);
    return;
  }

  host.innerHTML = `<section class="start-muted-card"><h2>Проверяю вход...</h2><div class="status">Загружаю профиль пользователя.</div></section>`;
  try {
    const profile = await getMyProfile({ refresh: true, timeout: 9000 });
    host.innerHTML = authCard(profile);
    renderFocus(profile);
    renderLinks(profile);
  } catch (error) {
    renderFocus(null);
    renderLinks(null);
    host.innerHTML = `<section class="start-auth-panel">
      <div>
        <span class="start-eyebrow">Текущая сессия</span>
        <h2>Вход найден, профиль не загрузился</h2>
        <p class="muted">${esc(error.message || error)}</p>
      </div>
      <div class="start-auth-actions">
        <a class="btn primary" href="./dashboard-v2.html">Рабочий стол</a>
        <a class="btn light" href="./nav-system-check-v2.html">Проверка</a>
        <a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a>
        <button id="startLogout" class="btn light" type="button">Выйти</button>
      </div>
    </section>`;
  }

  const logout = document.getElementById('startLogout');
  if (logout) logout.onclick = async () => {
    logout.disabled = true;
    logout.textContent = 'Выхожу...';
    await signOut();
    clearLocalNavigatorState();
    location.href = './nav-v2.html?clean=1';
  };
}

renderStartAuth();
