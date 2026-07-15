import { getCachedUser, renderAuthBox, rpc, signOut, esc, riskPill, statusText } from './supabase-v2.js';
import { buildDashboardFocus } from './dashboard-priority-v2.js?v=20260714-01';
import { buildMobileFirstScreenPlan } from './mobile-first-screen-model-v2.js?v=20260715-01';

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
    listTitle: 'Последние рабочие сделки',
    firstMetric: 'Рабочие сделки',
    focusTitle: 'Что делать сейчас',
    focusHint: 'Система выбрала три сделки с наиболее сильными рисками, просрочками и пробелами в ответственности.'
  };

  return ({
    owner: {
      ...common,
      title: 'Рабочий стол руководителя',
      description: 'Начните с трёх конкретных решений: кому назначить ответственность, где снять просрочку и какой риск разобрать первым.',
      primaryHref: './manager-v2.html',
      primaryLabel: 'Открыть контроль сегодня'
    },
    admin: {
      ...common,
      title: 'Рабочий стол администратора',
      description: 'Сначала устраните пробелы в ответственности и доступах, затем переходите к общему контролю сделок.',
      primaryHref: './manager-v2.html',
      primaryLabel: 'Открыть контроль сегодня'
    },
    manager: {
      ...common,
      title: 'Рабочий стол менеджера',
      description: 'Перед вами сделки команды, которые сильнее всего тормозят результат сегодня.',
      primaryHref: './manager-v2.html',
      primaryLabel: 'Открыть контроль сегодня',
      firstMetric: 'Сделки команды'
    },
    spn: {
      ...common,
      title: 'Рабочий стол СПН',
      description: 'Начните с одной сделки: снимите просрочку, выполните следующий шаг и зафиксируйте результат.',
      primaryHref: './spn-v2.html',
      primaryLabel: 'Создать сделку',
      listTitle: 'Последние мои сделки',
      firstMetric: 'Мои сделки',
      focusHint: 'Приоритет выше у сделок с красными рисками, просроченными задачами и недостающими документами.'
    },
    lawyer: {
      ...common,
      title: 'Рабочий стол юриста',
      description: 'Начните со стоп-факторов и сделок, где юридическая проверка ещё не назначена.',
      primaryHref: './queue-v2.html',
      primaryLabel: 'Открыть юридическую очередь',
      listTitle: 'Последние доступные сделки',
      focusHint: 'Приоритет выше у сделок с красными рисками, большим документным пробелом и отсутствующим юристом.'
    },
    broker: {
      ...common,
      title: 'Рабочий стол брокера',
      description: 'Начните со сделок, где требуется финансирование, но брокер или следующий финансовый шаг не определён.',
      primaryHref: './broker-v2.html',
      primaryLabel: 'Открыть брокерскую очередь',
      listTitle: 'Последние финансовые сделки',
      focusHint: 'Приоритет выше у ипотечных сделок без назначенного брокера и с просроченными задачами.'
    },
    viewer: {
      ...common,
      title: 'Обзор сделок',
      description: 'Короткий обзор: где самые сильные риски, просрочки и пробелы без возможности менять данные.',
      primaryHref: './viewer-v2.html',
      primaryLabel: 'Открыть обзор сделок',
      listTitle: 'Последние доступные сделки',
      firstMetric: 'Доступно для просмотра',
      focusTitle: 'На что обратить внимание',
      focusHint: 'Это информационный приоритет без оценки сотрудников и без права изменения данных.'
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
  const rawTitle = clean(deal?.display_title || deal?.title);
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
  return `<div class="status warn role-home-profile-notice" role="status"><b>Профиль СПН нужно уточнить:</b> ${esc(missing.join(', '))}. Обратитесь к администратору, чтобы передача сделок команде работала без ошибок.</div>`;
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
      <div><span class="small">Просрочено</span><b>${Number(deal.overdue_tasks_count || 0)}</b></div>
      <div><span class="small">Документы</span><b>${Number(deal.missing_documents_count || 0)}</b></div>
    </div>
    <p><b>Следующее действие:</b><br>${esc(deal.next_action || 'Проверить карточку')}</p>
    <div><span class="pill">${esc(statusText(deal.status))}</span></div>
  </a>`;
}

function reasonPill(reason) {
  return `<span class="role-home-reason ${esc(reason.type || 'neutral')}">${esc(reason.text || '')}</span>`;
}

function priorityCard(item, index) {
  const deal = item.deal || {};
  return `<article class="role-home-priority-card">
    <div class="role-home-priority-number" aria-hidden="true">${index + 1}</div>
    <div class="role-home-priority-main">
      <div class="role-home-priority-head">
        <div>
          <div class="small">${esc(item.actionTitle || 'Проверить сделку')}</div>
          <h3>${esc(dealDisplayTitle(deal))}</h3>
        </div>
        ${riskPill(deal.risk_level)}
      </div>
      <div class="role-home-reasons">${(item.reasons || []).map(reasonPill).join('')}</div>
      <p><b>Следующий шаг:</b> ${esc(deal.next_action || 'Открыть карточку и определить ближайшее действие.')}</p>
      <div class="role-home-priority-footer">
        <span class="small">Задаток ${Number(deal.readiness_deposit || 0)}% · Сделка ${Number(deal.readiness_deal || 0)}%</span>
        <a class="btn primary mobile-first-screen-primary-action" href="./deal-card-v2.html?id=${encodeURIComponent(deal.id)}">Открыть карточку</a>
      </div>
    </div>
  </article>`;
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
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell mobile-first-screen-page mobile-first-screen-dashboard">
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
      <details class="role-home-profile-details">
        <summary>Профиль и помощь</summary>
        <div class="role-home-profile-grid">
          <span><b>Менеджер:</b> ${esc(profile?.manager_name || 'не назначен')}</span>
          <span><b>Телефон:</b> ${esc(profile?.phone || 'не указан')}</span>
        </div>
        ${canSeeSystemCheck ? '<div class="actions" style="justify-content:flex-start"><a class="btn light" href="./nav-system-check-v2.html">Проверка системы</a><a class="btn light" href="./nav-v2.html?clean=1">Сбросить сессию</a></div>' : ''}
      </details>
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
  const focus = buildDashboardFocus(deals, profile.role, 3);
  const mobilePlan = buildMobileFirstScreenPlan('dashboard', { items: focus.items });
  const priorityHtml = mobilePlan.primaryItem ? priorityCard(mobilePlan.primaryItem, 0) : '';
  const secondaryPriorityHtml = mobilePlan.secondaryItems.length
    ? `<details class="mobile-first-screen-more role-home-priority-more"><summary>Ещё приоритеты <span class="pill blue">${mobilePlan.secondaryItems.length}</span></summary><div class="mobile-first-screen-more-list role-home-priority-more-list">${mobilePlan.secondaryItems.map((item, index) => priorityCard(item, index + 1)).join('')}</div></details>`
    : '';
  const exclusions = [];
  if (focus.hiddenDemoCount) exclusions.push(`демо-карточек скрыто: ${focus.hiddenDemoCount}`);
  if (focus.hiddenDuplicateCount) exclusions.push(`точных повторов объединено: ${focus.hiddenDuplicateCount}`);

  const body = `${profileNotice(profile)}
    <section class="card role-home-focus" aria-labelledby="roleHomeFocusTitle">
      <div class="section-title">
        <div>
          <span class="role-home-section-eyebrow">Приоритет</span>
          <h2 id="roleHomeFocusTitle">${esc(workspace.focusTitle)}</h2>
          <p class="muted">${esc(workspace.focusHint)}</p>
        </div>
        <a class="btn light" href="${esc(workspace.primaryHref)}">Открыть всю очередь</a>
      </div>
      ${exclusions.length ? `<div class="role-home-data-note">Сводка очищена: ${esc(exclusions.join(' · '))}.</div>` : ''}
      <div class="role-home-priority-list">${priorityHtml || '<div class="empty">Приоритетных сделок пока нет.</div>'}${secondaryPriorityHtml}</div>
    </section>
    <section class="kpi-row" aria-label="Рабочая сводка без демо и точных повторов">
      ${metric(workspace.firstMetric, focus.workingDealCount)}
      ${metric('Красные риски', focus.totals.redRisks, focus.totals.redRisks ? 'red' : 'green')}
      ${metric('Просрочено задач', focus.totals.overdueTasks, focus.totals.overdueTasks ? 'yellow' : 'green')}
      ${metric('Не хватает документов', focus.totals.missingDocuments, focus.totals.missingDocuments ? 'yellow' : 'green')}
      ${metric('Готовы к задатку', focus.totals.readyDeposit)}
    </section>
    <section class="card role-home-quick-actions">
      <div class="section-title">
        <div><h2>Быстрые действия</h2><p class="muted">Основной маршрут выбран по вашей роли. Технические разделы спрятаны из ежедневной работы.</p></div>
      </div>
      <div class="actions" style="justify-content:flex-start">
        <a class="btn primary" href="${esc(workspace.primaryHref)}">${esc(workspace.primaryLabel)}</a>
        ${secondaryWorkspaceLink(profile.role)}
        <a class="btn light" href="./dashboard-v2.html">Обновить сводку</a>
      </div>
    </section>
    <section class="card role-home-recent">
      <div class="section-title">
        <div><h2>${esc(workspace.listTitle)}</h2><p class="muted">Показаны шесть последних рабочих карточек без демо и точных повторов.</p></div>
        <a class="btn light" href="./deals-v2.html">Открыть все сделки</a>
      </div>
      <div class="deal-list">${focus.recentDeals.map(dealCard).join('') || '<div class="empty">Доступных сделок пока нет.</div>'}</div>
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
    <section class="hero"><h1>Рабочий стол</h1><p>Определяю вашу роль и выбираю три главных действия.</p></section>
    <div class="status" role="status" aria-live="polite">Загружаю сделки и формирую приоритеты. При медленном соединении это может занять до 45 секунд.</div>
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
