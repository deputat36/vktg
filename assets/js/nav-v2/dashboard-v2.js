import { getCachedUser, renderAuthBox, rpc, signOut, esc, riskPill, statusText } from './supabase-v2.js';

function shortId(id) {
  return String(id || '').slice(0, 8).toUpperCase();
}

function dateText(value) {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}

function roleName(role) {
  return ({
    owner: 'Владелец',
    admin: 'Администратор',
    manager: 'Менеджер',
    spn: 'СПН',
    lawyer: 'Юрист',
    broker: 'Брокер',
    viewer: 'Наблюдатель'
  })[role] || role || '—';
}

function roleWorkspace(role) {
  const common = {
    title: 'Рабочий стол',
    description: 'Сводка по доступным сделкам, документам, задачам и ближайшим действиям.',
    primaryHref: './deals-v2.html',
    primaryLabel: 'Открыть сделки',
    listTitle: 'Видимые сделки',
    firstMetric: 'Видимые сделки'
  };

  return ({
    owner: {
      ...common,
      title: 'Рабочий стол руководителя',
      description: 'Начните с очереди контроля: система покажет зависшие сделки, ответственных, сроки и причины остановки.',
      primaryHref: './manager-v2.html',
      primaryLabel: 'Что требует решения сегодня',
      listTitle: 'Все доступные сделки',
      firstMetric: 'Всего сделок'
    },
    admin: {
      ...common,
      title: 'Рабочий стол администратора',
      description: 'Контролируйте сделки и команду, но начинайте рабочий день с очереди решений, а не с технической диагностики.',
      primaryHref: './manager-v2.html',
      primaryLabel: 'Что требует решения сегодня',
      listTitle: 'Все доступные сделки',
      firstMetric: 'Всего сделок'
    },
    manager: {
      ...common,
      title: 'Рабочий стол менеджера',
      description: 'Главный маршрут — контроль сделок команды: просрочки, неназначенные ответственные, риски и ближайшие действия.',
      primaryHref: './manager-v2.html',
      primaryLabel: 'Открыть контроль сегодня',
      listTitle: 'Сделки команды',
      firstMetric: 'Сделки команды'
    },
    spn: {
      ...common,
      title: 'Рабочий стол СПН',
      description: 'Создавайте сделки, устраняйте замечания и контролируйте следующий шаг по своим клиентам.',
      primaryHref: './spn-v2.html',
      primaryLabel: 'Создать сделку',
      listTitle: 'Мои сделки',
      firstMetric: 'Мои сделки'
    },
    lawyer: {
      ...common,
      title: 'Рабочий стол юриста',
      description: 'Начните с юридической очереди: стоп-факторы, проблемные документы, просрочки и повторные проверки.',
      primaryHref: './queue-v2.html',
      primaryLabel: 'Открыть юридическую очередь',
      listTitle: 'Доступные сделки',
      firstMetric: 'Доступные сделки'
    },
    broker: {
      ...common,
      title: 'Рабочий стол брокера',
      description: 'Начните с предварительной финансовой оценки: назначение, недостающие суммы, сроки готовности денег и брокерская задача.',
      primaryHref: './broker-v2.html',
      primaryLabel: 'Открыть брокерскую очередь',
      listTitle: 'Сделки с финансовым участием',
      firstMetric: 'Доступные сделки'
    },
    viewer: {
      ...common,
      title: 'Обзор сделок',
      description: 'Режим наблюдения: статусы, готовность, препятствия и ближайшие действия без изменения данных.',
      primaryHref: './deals-v2.html',
      primaryLabel: 'Открыть обзор сделок',
      listTitle: 'Доступные для просмотра сделки',
      firstMetric: 'Доступно для просмотра'
    }
  })[role] || common;
}

function objectTypeName(type) {
  return ({
    flat_mkd: 'Квартира в МКД',
    flat_ground: 'Квартира на земле',
    room: 'Комната',
    share: 'Доля',
    share_room: 'Доля / комната',
    house_land: 'Дом с участком',
    house: 'Дом',
    land: 'Земельный участок',
    new_building: 'Новостройка',
    commercial: 'Коммерция'
  })[type] || 'Объект';
}

function clean(value) {
  return String(value || '').trim();
}

function isGenericTitle(title) {
  const text = clean(title).toLowerCase();
  return !text
    || text.includes('продавец не указан')
    || text.includes('покупатель не указан')
    || text.includes('адрес не указан');
}

function dealDisplayTitle(deal) {
  const rawTitle = clean(deal?.title);
  if (!isGenericTitle(rawTitle)) return rawTitle;
  const object = objectTypeName(deal?.object_type);
  const address = clean(deal?.address);
  if (address) return `${object} — ${address}`;
  return `${object} — адрес уточняется`;
}

function profileNotice(profile) {
  if (profile?.role !== 'spn') return '';
  const missing = [];
  if (!clean(profile?.manager_name) && !clean(profile?.manager_id)) missing.push('не назначен менеджер');
  if (!clean(profile?.phone)) missing.push('не указан телефон');
  if (!missing.length) return '';
  return `<div class="status warn" role="status"><b>Профиль СПН нужно уточнить:</b> ${esc(missing.join(', '))}. Обратитесь к администратору, чтобы передача сделок команде работала без ошибок.</div>`;
}

function metric(label, value, cls = '') {
  return `<div class="metric ${cls}"><span>${esc(label)}</span><b>${value ?? 0}</b></div>`;
}

function dealCard(deal) {
  return `<a class="deal-card" href="./deal-card-v2.html?id=${encodeURIComponent(deal.id)}">
    <div class="deal-head">
      <div>
        <div class="small">ID ${shortId(deal.id)} · ${dateText(deal.created_at)}</div>
        <div class="deal-title">${esc(dealDisplayTitle(deal))}</div>
        <div class="small">${esc(clean(deal.address) || 'Адрес уточняется')}</div>
      </div>
      ${riskPill(deal.risk_level)}
    </div>
    <div class="deal-meta">
      <div><span class="small">Задаток</span><b>${Number(deal.readiness_deposit || 0)}%</b></div>
      <div><span class="small">Документы</span><b>${Number(deal.missing_documents_count || 0)}</b></div>
      <div><span class="small">Задачи</span><b>${Number(deal.open_tasks_count || 0)}</b></div>
    </div>
    <p><b>Следующее действие:</b><br>${esc(deal.next_action || 'Проверить карточку')}</p>
    <div><span class="pill">${esc(statusText(deal.status))}</span></div>
  </a>`;
}

function secondaryWorkspaceLink(role) {
  if (role === 'owner' || role === 'admin') return '<a class="btn light" href="./admin-v2.html">Команда и доступы</a>';
  if (role === 'manager') return '<a class="btn light" href="./deals-v2.html">Сделки команды</a>';
  if (role === 'lawyer') return '<a class="btn light" href="./deals-v2.html?filter=lawyer">Все доступные сделки</a>';
  if (role === 'broker') return '<a class="btn light" href="./deals-v2.html?filter=broker">Все финансовые сделки</a>';
  if (role === 'spn') return '<a class="btn light" href="./deals-v2.html">Мои сделки</a>';
  return '<a class="btn light" href="./deals-v2.html">Сделки</a>';
}

function renderShell(profile, bodyHtml) {
  const role = profile?.role || '';
  const workspace = roleWorkspace(role);
  const email = profile?.email || getCachedUser()?.email || '';
  const canSeeSystemCheck = role === 'owner' || role === 'admin';
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero role-home-hero">
      <span class="role-home-eyebrow">${esc(roleName(role))}</span>
      <h1>${esc(workspace.title)}</h1>
      <p>${esc(workspace.description)}</p>
      <div class="actions role-home-actions" style="justify-content:flex-start">
        <a class="btn green" href="${esc(workspace.primaryHref)}">${esc(workspace.primaryLabel)}</a>
        ${secondaryWorkspaceLink(role)}
      </div>
    </section>
    <section class="card role-home-profile">
      <div class="section-title">
        <div><b>${esc(profile?.full_name || 'Пользователь')}</b><span class="small">${esc(email)} · ${esc(roleName(role))}</span></div>
        <button id="dashLogout" class="btn light" type="button">Выйти</button>
      </div>
      ${canSeeSystemCheck ? '<div class="actions" style="justify-content:flex-start"><a class="btn light" href="./nav-system-check-v2.html">Проверка системы</a><a class="btn light" href="./nav-v2.html?clean=1">Сбросить сессию</a></div>' : ''}
    </section>
    ${bodyHtml}
  </main>`;

  const logout = document.getElementById('dashLogout');
  if (logout) {
    logout.onclick = async () => {
      logout.disabled = true;
      logout.textContent = 'Выхожу...';
      try { await signOut(); } catch (_) {}
      location.href = './nav-v2.html?clean=1';
    };
  }
}

function renderDashboard(data) {
  const profile = data?.profile || {};
  const workspace = roleWorkspace(profile.role);
  const deals = Array.isArray(data?.items) ? data.items : [];

  const readyDeposit = deals.filter((deal) => Number(deal.readiness_deposit || 0) >= 80).length;
  const readyDeal = deals.filter((deal) => Number(deal.readiness_deal || 0) >= 80).length;
  const missingDocuments = deals.reduce((sum, deal) => sum + Number(deal.missing_documents_count || 0), 0);
  const openTasks = deals.reduce((sum, deal) => sum + Number(deal.open_tasks_count || 0), 0);

  const body = `${profileNotice(profile)}
    <section class="kpi-row" aria-label="Сводка по сделкам">
      ${metric(workspace.firstMetric, deals.length)}
      ${metric('Готовы к задатку', readyDeposit)}
      ${metric('Готовы к сделке', readyDeal)}
      ${metric('Не хватает документов', missingDocuments, missingDocuments ? 'yellow' : 'green')}
      ${metric('Открытые задачи', openTasks, openTasks ? 'yellow' : 'green')}
    </section>
    <section class="grid role-home-summary">
      <div class="card">
        <h2>Мой профиль</h2>
        <div class="list">
          <div class="list-item"><b>${esc(profile.full_name || 'Пользователь')}</b><span class="small">${esc(profile.email || '')}</span></div>
          <div class="list-item"><b>Роль</b>${esc(roleName(profile.role))}</div>
          <div class="list-item"><b>Менеджер</b>${esc(profile.manager_name || 'не назначен')}</div>
          <div class="list-item"><b>Телефон</b>${esc(profile.phone || 'не указан')}</div>
          <div class="list-item"><b>Доступ</b>${deals.length === 1 ? 'Видна 1 сделка.' : `Видимых сделок: ${deals.length}`}</div>
        </div>
      </div>
      <div class="card">
        <h2>С чего начать</h2>
        <p class="muted">Главное действие выбрано по вашей роли. Остальные разделы доступны через верхнее меню.</p>
        <div class="actions" style="justify-content:flex-start">
          <a class="btn primary" href="${esc(workspace.primaryHref)}">${esc(workspace.primaryLabel)}</a>
          ${secondaryWorkspaceLink(profile.role)}
          <a class="btn light" href="./dashboard-v2.html">Обновить сводку</a>
        </div>
      </div>
    </section>
    <section class="card">
      <div class="section-title"><div><h2>${esc(workspace.listTitle)}</h2><p class="muted">Откройте карточку, чтобы увидеть документы, риски, ответственных и ближайший шаг.</p></div><span class="pill blue">${deals.length}</span></div>
      <div class="deal-list">${deals.map(dealCard).join('') || '<div class="empty">Доступных сделок пока нет.</div>'}</div>
    </section>`;

  renderShell(profile, body);
}

function renderLogin(message = '') {
  const app = document.getElementById('app');
  app.innerHTML = '<main class="nav-v2-shell"><div id="dashboardAuthHost"></div></main>';
  renderAuthBox(document.getElementById('dashboardAuthHost'), async () => location.reload());
  const status = document.getElementById('authStatus');
  if (status && message) {
    status.className = 'status warn';
    status.textContent = message;
  }
}

async function load() {
  const app = document.getElementById('app');
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Рабочий стол</h1><p>Определяю вашу роль и загружаю нужный рабочий маршрут.</p></section>
    <div class="status" role="status" aria-live="polite">Загружаю доступные сделки. При медленном соединении это может занять до 45 секунд.</div>
  </main>`;

  if (!getCachedUser()?.id) {
    renderLogin('Сначала войдите в Навигатор.');
    return;
  }

  try {
    const data = await rpc('nav_v2_get_deals_list', { p_limit: 50 }, 45000);
    renderDashboard(data);
  } catch (error) {
    app.innerHTML = `<main class="nav-v2-shell">
      <section class="hero"><h1>Рабочий стол</h1><p>Не удалось загрузить список сделок.</p></section>
      <div class="status error" role="alert">${esc(error.message || error || 'Ошибка загрузки')}</div>
      <div class="status warn">Если сделка только что сохранялась, она могла создаться в базе. Сначала проверьте список, чтобы не создать дубль.</div>
      <div class="actions" style="justify-content:flex-start">
        <a class="btn primary" href="./dashboard-v2.html">Повторить</a>
        <a class="btn light" href="./deals-v2.html">Проверить список сделок</a>
        <a class="btn light" href="./nav-v2.html?clean=1">Сбросить сессию</a>
      </div>
    </main>`;
  }
}

load();
