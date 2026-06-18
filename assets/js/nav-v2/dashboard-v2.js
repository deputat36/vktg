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
    viewer: 'Просмотр'
  })[role] || role || '—';
}

function metric(label, value, cls = '') {
  return `<div class="metric ${cls}"><span>${esc(label)}</span><b>${value ?? 0}</b></div>`;
}

function dealCard(deal) {
  return `<a class="deal-card" href="./deal-card-v2.html?id=${encodeURIComponent(deal.id)}">
    <div class="deal-head">
      <div>
        <div class="small">ID ${shortId(deal.id)} · ${dateText(deal.created_at)}</div>
        <div class="deal-title">${esc(deal.title || 'Сделка без названия')}</div>
        <div class="small">${esc(deal.address || 'Адрес не указан')}</div>
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

function renderShell(profile, bodyHtml) {
  const role = profile?.role || '';
  const email = profile?.email || getCachedUser()?.email || '';
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero">
      <h1>Рабочий стол v2</h1>
      <p>Профиль: <b>${esc(profile?.full_name || 'Пользователь')}</b> · ${esc(email)} · роль: ${esc(roleName(role))}</p>
    </section>
    <section class="card">
      <div class="actions" style="justify-content:flex-start">
        <a class="btn primary" href="./dashboard-v2.html">Рабочий стол</a>
        ${role === 'spn' ? '<a class="btn green" href="./spn-v2.html">Новая сделка</a>' : ''}
        <a class="btn light" href="./deals-v2.html">Сделки</a>
        <a class="btn light" href="./nav-system-check-v2.html">Проверка</a>
        <a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a>
        <button id="dashLogout" class="btn light" type="button">Выйти</button>
      </div>
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
  const deals = Array.isArray(data?.items) ? data.items : [];

  const readyDeposit = deals.filter((deal) => Number(deal.readiness_deposit || 0) >= 80).length;
  const readyDeal = deals.filter((deal) => Number(deal.readiness_deal || 0) >= 80).length;
  const missingDocuments = deals.reduce((sum, deal) => sum + Number(deal.missing_documents_count || 0), 0);
  const openTasks = deals.reduce((sum, deal) => sum + Number(deal.open_tasks_count || 0), 0);

  const body = `<section class="kpi-row">
      ${metric('Всего сделок', deals.length)}
      ${metric('Готовы к задатку', readyDeposit)}
      ${metric('Готовы к сделке', readyDeal)}
      ${metric('Документы', missingDocuments, missingDocuments ? 'yellow' : 'green')}
      ${metric('Открытые задачи', openTasks, openTasks ? 'yellow' : 'green')}
    </section>
    <section class="grid">
      <div class="card">
        <h2>Профиль</h2>
        <div class="list">
          <div class="list-item"><b>${esc(profile.full_name || 'Пользователь')}</b><span class="small">${esc(profile.email || '')}</span></div>
          <div class="list-item"><b>Роль</b>${esc(roleName(profile.role))}</div>
          <div class="list-item"><b>Контроль доступа</b>${deals.length === 1 ? 'Видна 1 сделка.' : `Видимых сделок: ${deals.length}`}</div>
        </div>
      </div>
      <div class="card">
        <h2>Быстрые действия</h2>
        <div class="actions" style="justify-content:flex-start">
          ${profile.role === 'spn' ? '<a class="btn primary" href="./spn-v2.html">Создать сделку</a>' : ''}
          <a class="btn light" href="./deals-v2.html">Открыть список сделок</a>
          <a class="btn light" href="./dashboard-v2.html">Обновить</a>
        </div>
      </div>
    </section>
    <section class="card">
      <div class="section-title"><h2>${profile.role === 'spn' ? 'Мои сделки' : 'Видимые сделки'}</h2><span class="pill blue">${deals.length}</span></div>
      <div class="deal-list">${deals.map(dealCard).join('') || '<div class="empty">Сделок нет.</div>'}</div>
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
    <section class="hero"><h1>Рабочий стол v2</h1><p>Загружаю лёгкий рабочий стол...</p></section>
    <div class="status">Загружаю список видимых сделок.</div>
    <div class="actions" style="justify-content:flex-start">
      <a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a>
      <a class="btn light" href="./deals-v2.html">Список сделок</a>
    </div>
  </main>`;

  if (!getCachedUser()?.id) {
    renderLogin('Сначала войдите в Навигатор.');
    return;
  }

  try {
    const data = await rpc('nav_v2_get_deals_list', { p_limit: 50 }, 15000);
    renderDashboard(data);
  } catch (error) {
    app.innerHTML = `<main class="nav-v2-shell">
      <section class="hero"><h1>Рабочий стол v2</h1><p>Не удалось загрузить список сделок.</p></section>
      <div class="status error">${esc(error.message || error || 'Ошибка загрузки')}</div>
      <div class="actions" style="justify-content:flex-start">
        <a class="btn primary" href="./dashboard-v2.html">Повторить</a>
        <a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a>
        <a class="btn light" href="./deals-v2.html">Список сделок</a>
      </div>
    </main>`;
  }
}

load();
