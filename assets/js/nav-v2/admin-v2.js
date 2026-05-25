import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

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

function session() {
  try { return JSON.parse(localStorage.getItem('nav_session_v2') || 'null'); } catch (_) { return null; }
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
      <button class="btn light" data-password-link="${user.id}" type="button">Ссылка на пароль</button>
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

function testingSummary() {
  const demoReady = dealStats.demo >= 5;
  const realReady = dealStats.real > 0;
  return `<section class="card">
    <div class="section-title">
      <div>
        <h2>Сводка тестирования v2</h2>
        <p class="muted">Короткий контрольный список по текущей версии Навигатора сделок v2.</p>
      </div>
      <span class="pill ${demoReady ? 'green' : 'yellow'}">${demoReady ? 'демо-набор есть' : 'демо-набор не полный'}</span>
    </div>
    <div class="kpi-row">
      <div class="metric green"><span>Проверено сценариев</span><b>3</b></div>
      <div class="metric"><span>Демо-сделок</span><b>${dealStats.demo}</b></div>
      <div class="metric"><span>Рабочих сделок</span><b>${dealStats.real}</b></div>
      <div class="metric ${realReady ? 'green' : 'yellow'}"><span>Готовность к UI-тесту</span><b>${demoReady ? 'да' : 'нет'}</b></div>
    </div>
    <div class="grid">
      <div class="card" style="box-shadow:none">
        <h3>Уже проверено</h3>
        <div class="list">
          <div class="list-item"><b><span class="pill green">OK</span> Зеленая сделка</b>Статус, документы, задача, комментарий и пересчет рабочего стола.</div>
          <div class="list-item"><b><span class="pill green">OK</span> Красная сделка</b>Дети, маткапитал, красные риски, задача юриста, стоп-документы и комментарий.</div>
          <div class="list-item"><b><span class="pill green">OK</span> Ипотечная сделка</b>Очередь брокера, ипотечные документы, задачи брокера и комментарий.</div>
          <div class="list-item"><b><span class="pill green">OK</span> Демо-защита</b>Демо-сделки отделены от рабочих, есть фильтры, бейджи и подтверждения действий.</div>
          <div class="list-item"><b><span class="pill green">OK</span> Разделение проектов</b>Работа ведется только через nav_ / nav-, без использования таблиц CRM «Лидер».</div>
        </div>
      </div>
      <div class="card" style="box-shadow:none">
        <h3>Что еще проверить вручную</h3>
        <div class="list">
          <div class="list-item"><b><span class="pill yellow">UI</span> Создание новой сделки</b>Пройти мастер СПН в браузере от начала до перехода в карточку.</div>
          <div class="list-item"><b><span class="pill yellow">UI</span> Приглашение сотрудника</b>Проверить отправку приглашения через Edge Function на реальный email.</div>
          <div class="list-item"><b><span class="pill yellow">UI</span> Роли</b>Проверить видимость сделок для СПН, менеджера, юриста, брокера и наблюдателя.</div>
          <div class="list-item"><b><span class="pill yellow">UX</span> Мобильный экран</b>Проверить карточку сделки, список и рабочий стол с телефона.</div>
          <div class="list-item"><b><span class="pill yellow">Бизнес-логика</span> Очереди</b>Решить, когда сделка окончательно выходит из очереди юриста/брокера: по задаче, документу, ревью или отдельному флагу.</div>
        </div>
      </div>
    </div>
    <div class="actions" style="justify-content:flex-start">
      <a class="btn primary" href="./spn-v2.html">Пройти мастер СПН</a>
      <a class="btn light" href="./dashboard-v2.html">Открыть рабочий стол</a>
      <a class="btn light" href="./deals-v2.html?filter=demo">Открыть демо-сделки</a>
      <a class="btn light" href="./admin-invite-v2.html">Проверить приглашение</a>
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
    ${testingSummary()}
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

async function sendPasswordLink(id) {
  const user = users.find((u) => u.id === id);
  if (!user?.email) return setStatus('У пользователя не указан email.', 'error');
  const s = session();
  if (!s?.access_token) return setStatus('Сначала войдите в систему.', 'error');

  try {
    setStatus(`Отправляю ссылку для установки пароля на ${user.email}...`);
    const response = await fetch(`${SUPABASE_URL}/functions/v1/nav-invite-user`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: user.email,
        full_name: user.full_name || user.email,
        phone: user.phone || null,
        role: user.role || 'spn'
      })
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { error: text }; }
    if (!response.ok) throw new Error(data?.error || data?.message || response.statusText);
    setStatus(data?.message || 'Ссылка для установки пароля отправлена на email.', 'ok');
  } catch (e) {
    setStatus('Ошибка отправки ссылки: ' + e.message, 'error');
  }
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
  document.querySelectorAll('[data-password-link]').forEach((btn) => btn.onclick = () => sendPasswordLink(btn.dataset.passwordLink));
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