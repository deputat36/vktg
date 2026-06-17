import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';

let users = [];
let dealStats = { total: 0, demo: 0, real: 0, lastDemoAt: null };
let loadErrors = [];

const roles = [
  ['owner','Владелец'], ['admin','Админ'], ['manager','Менеджер'], ['spn','СПН'],
  ['lawyer','Юрист'], ['broker','Брокер'], ['viewer','Наблюдатель']
];

function dateText(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }
function roleOptions(selected) { return roles.map(([id, title]) => `<option value="${id}" ${selected === id ? 'selected' : ''}>${title}</option>`).join(''); }
function managerOptions(selected) {
  const managers = users.filter((u) => ['owner','admin','manager'].includes(u.role));
  return `<option value="">Без менеджера</option>${managers.map((u) => `<option value="${u.id}" ${selected === u.id ? 'selected' : ''}>${esc(u.full_name || u.email)}</option>`).join('')}`;
}
function isDemoDeal(deal) { return deal?.deal_summary?.demo === true || deal?.wizard_snapshot?.demo === true || String(deal?.title || '').startsWith('ДЕМО:'); }
function calcDealStats(deals = []) {
  const demoDeals = deals.filter(isDemoDeal);
  const lastDemoAt = demoDeals.map((deal) => deal.created_at || deal.updated_at).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
  dealStats = { total: deals.length, demo: demoDeals.length, real: deals.length - demoDeals.length, lastDemoAt };
}
function statusBox() {
  if (!loadErrors.length) return '<div class="status ok">Админка загружена. Основной способ доступа: профиль в команде + ссылка доступа.</div>';
  return `<div class="status warn">Часть данных загружена в запасном режиме: ${esc(loadErrors.join(' / '))}</div>`;
}
function setStatus(text, type='info') { const el = document.getElementById('adminStatus'); if (el) { el.className = 'status ' + type; el.textContent = text; } }
function setDemoStatus(text, type='info') { const el = document.getElementById('demoStatus'); if (el) { el.className = 'status ' + type; el.textContent = text; } }

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
      <button class="btn primary" data-save-user="${user.id}" type="button">Сохранить роль</button>
      <a class="btn green" href="./nav-access-v2.html">Создать доступ</a>
      <button class="btn ${user.is_active ? 'red' : 'green'}" data-toggle-user="${user.id}" data-active="${user.is_active ? 'false' : 'true'}" type="button">${user.is_active ? 'Выключить' : 'Включить'}</button>
    </div>
  </div>`;
}

function accessGuide() {
  return `<section class="card" style="border:2px solid rgba(37,99,235,.2)">
    <div class="section-title"><div><h2>Как дать доступ сотруднику</h2><p class="muted">Используем единый рабочий сценарий: профиль сотрудника в команде и безопасная ссылка доступа.</p></div><span class="pill blue">рекомендуется</span></div>
    <div class="grid">
      <div class="list-item"><b>1. Добавить в команду</b>Создайте или обновите профиль сотрудника в Навигаторе: email, ФИО, роль, менеджер.</div>
      <div class="list-item"><b>2. Создать ссылку доступа</b>Откройте страницу «Создать доступ», укажите email и роль, затем скопируйте безопасную ссылку.</div>
      <div class="list-item"><b>3. Открыть ссылку в инкогнито</b>Сотрудник задает пароль без смешивания сессии владельца и своей сессии.</div>
      <div class="list-item"><b>4. Проверить роль</b>После входа роль берется только из <code>nav_user_profiles</code>. Для СПН админ-разделы должны быть закрыты.</div>
    </div>
    <div class="actions" style="justify-content:flex-start"><a class="btn primary" href="#new-user-box">Добавить профиль</a><a class="btn green" href="./nav-access-v2.html">Создать доступ</a></div>
  </section>`;
}

function demoControls() {
  return `<section class="card"><div class="section-title"><div><h2>Демо-данные v2</h2><p class="muted">Демо-набор создается только в таблицах nav_ и не затрагивает CRM «Лидер».</p></div><span class="pill yellow">owner/admin</span></div><div class="kpi-row"><div class="metric"><span>Всего сделок</span><b>${dealStats.total}</b></div><div class="metric"><span>Демо</span><b>${dealStats.demo}</b></div><div class="metric green"><span>Рабочие</span><b>${dealStats.real}</b></div><div class="metric"><span>Последнее демо</span><b>${dateText(dealStats.lastDemoAt)}</b></div></div><div id="demoStatus" class="status">Готово к работе с демо-набором.</div><div class="actions" style="justify-content:flex-start"><button id="seedDemoData" class="btn primary" type="button">Создать / пересоздать демо-набор</button><button id="clearDemoData" class="btn red" type="button">Очистить демо-набор</button><a class="btn light" href="./dashboard-v2.html">Рабочий стол</a><a class="btn light" href="./deals-v2.html?filter=demo">Демо-сделки</a><a class="btn light" href="./deals-v2.html?filter=real">Рабочие сделки</a></div></section>`;
}

function testingSummary() {
  return `<section class="card"><div class="section-title"><div><h2>Сводка тестирования v2</h2><p class="muted">Контроль стабильности текущей версии.</p></div><span class="pill ${dealStats.demo >= 5 ? 'green' : 'yellow'}">${dealStats.demo >= 5 ? 'демо-набор есть' : 'демо-набор не полный'}</span></div><div class="grid"><div class="card" style="box-shadow:none"><h3>Уже проверено</h3><div class="list"><div class="list-item"><b><span class="pill green">OK</span> Демо-защита</b>Демо-сделки отделены от рабочих.</div><div class="list-item"><b><span class="pill green">OK</span> Список и карточка</b>Статусы, документы, задачи и комментарии работают.</div><div class="list-item"><b><span class="pill green">OK</span> Разделение проектов</b>Используются только nav_ / nav-, без leader_.</div></div></div><div class="card" style="box-shadow:none"><h3>Нужно довести</h3><div class="list"><div class="list-item"><b><span class="pill yellow">UX</span> Мобильное меню</b>Проверить удобство на телефоне после финальных правок.</div><div class="list-item"><b><span class="pill yellow">Auth</span> Финальный тест СПН</b>Создать тестовый доступ, открыть ссылку в инкогнито и войти под СПН.</div><div class="list-item"><b><span class="pill yellow">Роли</span> Проверка прав</b>СПН, менеджер, юрист, брокер, наблюдатель.</div></div></div></div><div class="actions" style="justify-content:flex-start"><a class="btn primary" href="./spn-v2.html">Мастер СПН</a><a class="btn light" href="./nav-access-v2.html">Создать доступ</a><a class="btn light" href="./nav-system-check-v2.html">Проверка системы</a></div></section>`;
}

function render() {
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell"><section class="hero"><h1>Команда Навигатора</h1><p>Управление ролями только для CRM «Навигатор сделок». Таблицы и роли CRM «Лидер» не используются.</p></section>${statusBox()}${accessGuide()}<section class="grid"><div class="card" id="new-user-box"><h2>Профиль сотрудника в Навигаторе</h2><p class="muted">Этот блок создает/обновляет роль сотрудника в CRM. Для входа после этого создайте ссылку доступа.</p><div class="field"><label>Email</label><input id="newEmail" placeholder="user@example.ru"></div><div class="field"><label>Имя</label><input id="newName" placeholder="ФИО"></div><div class="field"><label>Телефон</label><input id="newPhone" placeholder="Можно оставить пустым"></div><div class="field"><label>Роль</label><select id="newRole">${roleOptions('spn')}</select></div><div class="field"><label>Менеджер</label><select id="newManager">${managerOptions('')}</select></div><div id="adminStatus" class="status">Шаг 1: добавьте профиль. Шаг 2: создайте ссылку доступа.</div><div class="actions" style="justify-content:flex-start"><button id="addUser" class="btn primary" type="button">Сохранить профиль</button><a class="btn green" href="./nav-access-v2.html">Создать доступ</a></div></div><div class="card"><h2>Роли</h2><div class="list"><div class="list-item"><b>owner/admin</b>Полный доступ.</div><div class="list-item"><b>manager</b>Контроль команды.</div><div class="list-item"><b>spn</b>Создание и ведение сделок.</div><div class="list-item"><b>lawyer/broker</b>Юридические и ипотечные очереди.</div></div></div></section>${demoControls()}${testingSummary()}<section class="card"><div class="section-title"><h2>Пользователи</h2><button id="reloadUsers" class="btn light" type="button">Обновить</button></div><div class="list">${users.map(row).join('') || '<div class="empty">Пользователи не загрузились. Попробуйте обновить вход или страницу.</div>'}</div></section></main>`;
  bind();
}

async function reloadDealStats() { const data = await rpc('nav_v2_get_deals_list', { p_limit: 200 }, 15000); calcDealStats(data.items || []); }

function bind() {
  document.getElementById('reloadUsers').onclick = load;
  document.getElementById('addUser').onclick = async () => {
    try {
      setStatus('Сохраняю профиль сотрудника...');
      await rpc('nav_v2_link_user_by_email', {
        p_email: document.getElementById('newEmail').value.trim(),
        p_full_name: document.getElementById('newName').value.trim(),
        p_role: document.getElementById('newRole').value,
        p_manager_id: document.getElementById('newManager').value || null,
        p_phone: document.getElementById('newPhone').value.trim() || null
      }, 15000);
      setStatus('Профиль сохранен. Теперь откройте «Создать доступ» и сформируйте ссылку для входа.', 'ok');
      await load();
    } catch (e) { setStatus('Ошибка профиля: ' + e.message + '. Если аккаунта еще нет в Auth, используйте страницу «Создать доступ».', 'error'); }
  };
  document.getElementById('seedDemoData').onclick = async () => {
    try { setDemoStatus('Создаю демо-набор...'); const result = await rpc('nav_v2_seed_demo_data', {}, 20000); await reloadDealStats(); render(); setDemoStatus(`Демо-набор создан: ${result.created_deals || 0} сделок.`, 'ok'); }
    catch (e) { setDemoStatus('Ошибка демо-набора: ' + e.message, 'error'); }
  };
  document.getElementById('clearDemoData').onclick = async () => {
    if (!confirm('Удалить только демо-сделки Навигатора v2?')) return;
    try { setDemoStatus('Очищаю демо-набор...'); const result = await rpc('nav_v2_clear_demo_data', {}, 20000); await reloadDealStats(); render(); setDemoStatus(`Удалено сделок: ${result.deleted_deals || 0}.`, 'ok'); }
    catch (e) { setDemoStatus('Ошибка очистки: ' + e.message, 'error'); }
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
    }, 15000);
    setStatus('Изменения сохранены.', 'ok');
    await load();
  } catch (e) { setStatus('Ошибка: ' + e.message, 'error'); }
}

async function load() {
  document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status">Загружаю команду...</div></main>';
  loadErrors = [];
  users = [];
  dealStats = { total: 0, demo: 0, real: 0, lastDemoAt: null };
  try { const userData = await rpc('nav_v2_list_users', {}, 15000); users = userData.items || []; } catch (e) { loadErrors.push('пользователи: ' + e.message); }
  try { await reloadDealStats(); } catch (e) { loadErrors.push('статистика: ' + e.message); }
  render();
}

async function init() {
  setupTop('admin');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  await load();
}

init();
