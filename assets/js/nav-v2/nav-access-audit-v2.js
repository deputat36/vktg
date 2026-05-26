import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';

let data = null;

function metric(label, value, cls = '') {
  return `<div class="metric ${cls}"><span>${label}</span><b>${value ?? 0}</b></div>`;
}

function roleName(role) {
  return ({ owner: 'Владелец', admin: 'Админ', manager: 'Менеджер', spn: 'СПН', lawyer: 'Юрист', broker: 'Брокер', viewer: 'Наблюдатель' })[role] || role || '—';
}

function explain(user) {
  if (!user.is_active) return 'Профиль выключен. Доступ должен быть закрыт.';
  if (['owner', 'admin'].includes(user.role)) return 'Полный доступ к Навигатору.';
  if (user.role === 'manager') return `Видит сделки своей команды: ${user.team_deals || 0}, а также прямо назначенные сделки.`;
  if (user.role === 'spn') return `Видит свои сделки СПН: ${user.own_spn_deals || 0}, созданные им: ${user.created_deals || 0}.`;
  if (user.role === 'lawyer') return `Видит юридическую очередь: ${user.lawyer_queue_deals || 0}.`;
  if (user.role === 'broker') return `Видит брокерскую очередь: ${user.broker_queue_deals || 0}.`;
  if (user.role === 'viewer') return 'Режим просмотра. Видимость зависит от дополнительных правил/участия.';
  return 'Роль не распознана.';
}

function userRow(user) {
  const warn = !user.is_active || (user.role === 'spn' && Number(user.visible_deals || 0) === 0) || (['owner','admin'].includes(user.role) && Number(user.visible_deals || 0) === 0);
  return `<div class="list-item">
    <div class="section-title">
      <div>
        <b>${esc(user.full_name || user.email)}</b>
        <div class="small">${esc(user.email || '')}</div>
      </div>
      <div>
        <span class="pill ${user.is_active ? 'green' : 'red'}">${user.is_active ? 'активен' : 'выключен'}</span>
        <span class="pill blue">${esc(roleName(user.role))}</span>
        ${warn ? '<span class="pill yellow">проверить</span>' : ''}
      </div>
    </div>
    <div class="kpi-row">
      ${metric('Видит сделок', user.visible_deals)}
      ${metric('Создал', user.created_deals)}
      ${metric('Свои СПН', user.own_spn_deals)}
      ${metric('Команда', user.team_deals)}
    </div>
    <div class="kpi-row">
      ${metric('Юристу', user.lawyer_queue_deals)}
      ${metric('Брокеру', user.broker_queue_deals)}
      ${metric('Прямо менеджер', user.directly_managed_deals)}
      ${metric('Менеджер', user.manager_name || '—')}
    </div>
    <div class="status ${warn ? 'warn' : 'ok'}">${esc(explain(user))}</div>
  </div>`;
}

function render() {
  const summary = data?.summary || {};
  const items = data?.items || [];
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero">
      <h1>Аудит доступов v2</h1>
      <p>Проверка ролей и видимости сделок. Используются только nav_user_profiles и nav_ таблицы Навигатора.</p>
    </section>
    <section class="card">
      <div class="section-title">
        <div>
          <h2>Сводка</h2>
          <p class="muted">Если у сотрудника 0 видимых сделок — это может быть нормально для нового пользователя, но стоит проверить после тестовой сделки.</p>
        </div>
        <button id="reloadAudit" class="btn primary" type="button">Обновить аудит</button>
      </div>
      <div class="kpi-row">
        ${metric('Пользователей', summary.users_total)}
        ${metric('Активных', summary.users_active, 'green')}
        ${metric('Всего сделок', summary.deals_total)}
        ${metric('Owner/Admin', summary.owners_admins)}
      </div>
      <div class="kpi-row">
        ${metric('Менеджеры', summary.managers)}
        ${metric('СПН', summary.spn)}
        ${metric('Юристы', summary.lawyers)}
        ${metric('Брокеры', summary.brokers)}
      </div>
    </section>
    <section class="card">
      <div class="section-title"><h2>Пользователи и доступы</h2><a class="btn light" href="./admin-v2.html">Команда</a></div>
      <div class="list">${items.map(userRow).join('') || '<div class="empty">Нет данных аудита.</div>'}</div>
    </section>
    <section class="card">
      <h2>Как читать аудит</h2>
      <div class="list">
        <div class="list-item"><b>owner/admin</b>Должен видеть все сделки Навигатора.</div>
        <div class="list-item"><b>manager</b>Должен видеть сделки сотрудников, где он указан как менеджер.</div>
        <div class="list-item"><b>spn</b>Должен видеть свои сделки: созданные, seller_spn_id или buyer_spn_id.</div>
        <div class="list-item"><b>lawyer</b>Должен видеть сделки с lawyer_needed = true.</div>
        <div class="list-item"><b>broker</b>Должен видеть сделки с broker_needed = true.</div>
      </div>
    </section>
  </main>`;
  document.getElementById('reloadAudit').onclick = load;
}

async function load() {
  document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status">Загружаю аудит доступов...</div></main>';
  try {
    data = await rpc('nav_v2_get_access_audit', {}, 20000);
    render();
  } catch (error) {
    document.getElementById('app').innerHTML = `<main class="nav-v2-shell"><div class="status error">Ошибка аудита: ${esc(error.message)}</div><div class="actions" style="justify-content:flex-start"><a class="btn light" href="./nav-system-check-v2.html">Проверка системы</a><a class="btn light" href="./admin-v2.html">Команда</a></div></main>`;
  }
}

async function init() {
  setupTop('admin');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  await load();
}

init();
