import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';

let users = [];
let dealStats = { total: 0, demo: 0, real: 0, lastDemoAt: null };
const roles = [
  ['owner','Владелец'],
  ['admin','Админ'],
  ['manager','Менеджер'],
  ['spn','СПН'],
  ['lawyer','Юрист'],
  ['broker','Брокер'],
  ['viewer','Наблюдатель']
];

function roleOptions(selected) {
  return roles.map(([id, title]) => `<option value="${id}" ${selected === id ? 'selected' : ''}>${title}</option>`).join('');
}

function managerOptions(selected) {
  const managers = users.filter((u) => ['owner','admin','manager'].includes(u.role));
  return `<option value="">Без менеджера</option>${managers.map((u) => `<option value="${u.id}" ${selected === u.id ? 'selected' : ''}>${esc(u.full_name || u.email)}</option>`).join('')}`;
}

function dateText(value) {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}

function isDemoDeal(deal) {
  return deal?.deal_summary?.demo === true
    || deal?.wizard_snapshot?.demo === true
    || String(deal?.title || '').startsWith('ДЕМО:');
}

function calcDealStats(deals = []) {
  const demoDeals = deals.filter(isDemoDeal);
  const lastDemoAt = demoDeals
    .map((deal) => deal.created_at || deal.updated_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] || null;
  dealStats = {
    total: deals.length,
    demo: demoDeals.length,
    real: deals.length - demoDeals.length,
    lastDemoAt
  };
}

function row(user) {
  return `<div class="list-item">
    <div class="grid">
      <div>
        <b>${esc(user.full_name || user.email)}</b>
        <span class="small">${esc(user.email || '')}</span><br>
        <span class="pill ${user.is_active ? 'green' : 'red'}">${user.is_active ? 'активен' : 'выключен'}</span>
        <span class="pill blue">${esc(user.role)}</span>
      </div>
      <div>
        <div class="field"><label>Имя</label><input data-name="${user.id}" value="${esc(user.full_name || '')}"></div>
        <div class="field"><label>Телефон</label><input data-phone="${user.id}" value="${esc(user.phone || '')}"></div>
      </div>
    </div>
    <div class="grid">
      <div class="field"><label>Роль</label><select data-role="${user.id}">${roleOptions(user.role)}</select></div>
      <div class="field"><label>Менеджер</label><select data-manager="${user.id}">${managerOptions(user.manager_id)}</select></div>
    </div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn primary" data-save-user="${user.id}" type="button">Сохранить</button>
      <button class="btn ${user.is_active ? 'red' : 'green'}" data-toggle-user="${user.id}" data-active="${user.is_active ? 'false' : 'true'}" type="button">${user.is_active ? 'Выключить' : 'Включить'}</button>
    </div>
  </div>`;
}

function demoControls() {
  return `<section class="card">
    <div class="section-title">
      <div>
        <h2>Демо-данные v2</h2>
        <p class="muted">Безопасный тестовый набор создается только в таблицах nav_ и помечается как demo: true. Реальные сделки не удаляются.</p>
      </div>
      <span class="pill yellow">owner/admin</span>
    </div>
    <div class="kpi-row">
      <div class="metric"><span>Всего сделок</span><b>${dealStats.total}</b></div>
      <div class="metric"><span>Демо</span><b>${dealStats.demo}</b></div>
      <div class="metric green"><span>Рабочие</span><b>${dealStats.real}</b></div>
      <div class="metric"><span>Последнее демо</span><b>${dateText(dealStats.lastDemoAt)}</b></div>
    </div>
    <div class="list">
      <div class="list-item">
        <b>Что создается</b>
        5 сделок: зеленая, ипотечная, красная с детьми/маткапиталом, сделка с несогласованными расходами и сделка с несогласованными расчетами.
      </div>
      <div class="list-item">
        <b>Что удаляется</b>
        Только сделки с признаком demo: true или заголовком, начинающимся с «ДЕМО:».
      </div>
    </div>
    <div id="demoStatus" class="status">Готово к работе с демо-набором.</div>
    <div class="actions" style="justify-content:flex-start">
      <button id="seedDemoData" class="btn primary" type="button">Создать / пересоздать демо-набор</button>
      <button id="clearDemoData" class="btn red" type="button">Очистить демо-набор</button>
      <a class="btn light" href="./dashboard-v2.html">Проверить рабочий стол</a>
      <a class="btn light" href="./deals-v2.html?filter=demo">Открыть только демо-сделки</a>
      <a class="btn light" href="./deals-v2.html?filter=real">Открыть рабочие сделки</a>
    </div>
  </section>`;
}

function render() {
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Команда Навигатора</h1><p>Управление ролями только для CRM «Навигатор сделок». Таблицы и роли CRM «Лидер» не используются.</p></section>
    <section class="grid">
      <div class="card">
        <h2>Добавить пользователя</h2>
        <p class="muted">Пользователь должен уже существовать в Supabase Auth. Здесь мы только подключаем его к CRM Навигатор сделок и назначаем роль.</p>
        <div class="field"><label>Email</label><input id="newEmail" placeholder="user@example.ru"></div>
        <div class="field"><label>Имя</label><input id="newName" placeholder="ФИО"></div>
        <div class="field"><label>Телефон</label><input id="newPhone" placeholder="Можно оставить пустым"></div>
        <div class="field"><label>Роль</label><select id="newRole">${roleOptions('spn')}</select></div>
        <div class="field"><label>Менеджер</label><select id="newManager">${managerOptions('')}</select></div>
        <div id="adminStatus" class="status">Готово к добавлению.</div>
        <button id="addUser" class="btn primary" type="button">Добавить в Навигатор</button>
      </div>
      <div class="card">
        <h2>Роли</h2>
        <div class="list">
          <div class="list-item"><b>owner/admin</b>Полный доступ к CRM Навигатор сделок.</div>
          <div class="list-item"><b>manager</b>Контроль команды и проблемных сделок.</div>
          <div class="list-item"><b>spn</b>Создание и ведение своих сделок.</div>
          <div class="list-item"><b>lawyer</b>Юридическая проверка сделок.</div>
          <div class="list-item"><b>broker</b>Ипотека, банк, маткапитал и расчеты.</div>
        </div>
      </div>
    </section>
    ${demoControls()}
    <section class="card"><div class="section-title"><h2>Пользователи</h2><button id="reloadUsers" class="btn light" type="button">Обновить</button></div><div class="list">${users.map(row).join('') || '<div class="empty">Пользователей пока нет.</div>'}</div></section>
  </main>`;
  bind();
}

function setStatus(text, type='info') {
  const el = document.getElementById('adminStatus');
  if (el) { el.className = 'status ' + type; el.textContent = text; }
}

function setDemoStatus(text, type='info') {
  const el = document.getElementById('demoStatus');
  if (el) { el.className = 'status ' + type; el.textContent = text; }
}

async function reloadDealStats() {
  const data = await rpc('nav_v2_get_deals_list', { p_limit: 200 });
  calcDealStats(data.items || []);
}

function bind() {
  document.getElementById('reloadUsers').onclick = load;
  document.getElementById('addUser').onclick = async () => {
    try {
      setStatus('Добавляю пользователя...');
      await rpc('nav_v2_link_user_by_email', {
        p_email: document.getElementById('newEmail').value.trim(),
        p_full_name: document.getElementById('newName').value.trim(),
        p_role: document.getElementById('newRole').value,
        p_manager_id: document.getElementById('newManager').value || null,
        p_phone: document.getElementById('newPhone').value.trim() || null
      });
      setStatus('Пользователь добавлен.', 'ok');
      await load();
    } catch (e) { setStatus('Ошибка: ' + e.message, 'error'); }
  };

  document.getElementById('seedDemoData').onclick = async () => {
    try {
      setDemoStatus('Создаю демо-набор. Старые демо-сделки будут безопасно пересозданы...');
      const result = await rpc('nav_v2_seed_demo_data', {});
      await reloadDealStats();
      render();
      setDemoStatus(`Демо-набор создан: ${result.created_deals || 0} сделок.`, 'ok');
    } catch (e) {
      setDemoStatus('Ошибка создания демо-набора: ' + e.message, 'error');
    }
  };

  document.getElementById('clearDemoData').onclick = async () => {
    if (!confirm('Удалить только демо-сделки Навигатора v2? Реальные сделки не будут затронуты.')) return;
    try {
      setDemoStatus('Очищаю демо-набор...');
      const result = await rpc('nav_v2_clear_demo_data', {});
      await reloadDealStats();
      render();
      setDemoStatus(`Демо-набор очищен. Удалено сделок: ${result.deleted_deals || 0}.`, 'ok');
    } catch (e) {
      setDemoStatus('Ошибка очистки демо-набора: ' + e.message, 'error');
    }
  };

  document.querySelectorAll('[data-save-user]').forEach((btn) => btn.onclick = () => saveUser(btn.dataset.saveUser, null));
  document.querySelectorAll('[data-toggle-user]').forEach((btn) => btn.onclick = () => saveUser(btn.dataset.toggleUser, btn.dataset.active === 'true'));
}

async function saveUser(id, activeOverride) {
  const user = users.find((u) => u.id === id);
  if (!user) return;
  try {
    setStatus('Сохраняю пользователя...');
    await rpc('nav_v2_update_user_profile', {
      p_user_id: id,
      p_full_name: document.querySelector(`[data-name="${id}"]`).value.trim(),
      p_role: document.querySelector(`[data-role="${id}"]`).value,
      p_manager_id: document.querySelector(`[data-manager="${id}"]`).value || null,
      p_phone: document.querySelector(`[data-phone="${id}"]`).value.trim() || null,
      p_is_active: activeOverride === null ? user.is_active : activeOverride
    });
    setStatus('Изменения сохранены.', 'ok');
    await load();
  } catch (e) { setStatus('Ошибка: ' + e.message, 'error'); }
}

async function load() {
  document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status">Загружаю пользователей и статистику...</div></main>';
  try {
    const [userData, dealsData] = await Promise.all([
      rpc('nav_v2_list_users', {}),
      rpc('nav_v2_get_deals_list', { p_limit: 200 })
    ]);
    users = userData.items || [];
    calcDealStats(dealsData.items || []);
    render();
  } catch (e) {
    document.getElementById('app').innerHTML = `<main class="nav-v2-shell"><div class="status error">Ошибка загрузки: ${esc(e.message)}</div></main>`;
  }
}

async function init() {
  setupTop('admin');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  await load();
}

init();
