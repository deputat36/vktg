import '../integrations/appNav.js';
import { signInWithPassword, signOut, getCurrentUser } from '../integrations/supabase.js';
import { getAdminProfile, listAllProfiles, updateProfile, ROLE_OPTIONS } from '../integrations/adminApi.js';

let profiles = [];
let admin = null;
let filter = '';

function get(id) { return document.getElementById(id); }
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function roleLabel(role) {
  return (ROLE_OPTIONS.find((item) => item[0] === role) || [role, role])[1];
}
function profileName(id) {
  if (!id) return '—';
  const p = profiles.find((item) => item.id === id);
  return p ? p.full_name : id.slice(0, 8);
}
function setStatus(text, type = 'info') {
  const el = get('pageStatus');
  el.textContent = text;
  el.className = 'status ' + type;
}

async function refresh() {
  const user = await getCurrentUser();
  if (!user) {
    get('authBox').style.display = '';
    get('adminBox').style.display = 'none';
    setStatus('Войдите под администратором.', 'warn');
    return;
  }

  try {
    admin = await getAdminProfile();
    profiles = await listAllProfiles();
    document.body.dataset.role = 'admin';
    document.body.dataset.zone = 'admin';
    get('authBox').style.display = 'none';
    get('adminBox').style.display = '';
    renderAdminInfo();
    renderStats();
    renderProfiles();
    setStatus('Готово. Сотрудников в списке: ' + profiles.length, 'ok');
  } catch (error) {
    get('authBox').style.display = 'none';
    get('adminBox').style.display = 'none';
    setStatus('Нет доступа: ' + error.message, 'error');
  }
}

function renderAdminInfo() {
  get('adminInfo').innerHTML = `
    <div class="box role-card">
      <h2>⚙️ Администратор</h2>
      <table>
        <tr><th>ФИО</th><td>${esc(admin.full_name || '—')}</td></tr>
        <tr><th>Email</th><td>${esc(admin.email || '—')}</td></tr>
        <tr><th>Роль</th><td>${esc(roleLabel(admin.role))}</td></tr>
      </table>
    </div>
    <div class="box orangeBox">
      <h3>Важно</h3>
      <p>Нового пользователя сначала нужно создать в Supabase → Authentication → Users. После первого входа или создания профиля здесь можно назначить роль, руководителя и команду.</p>
      <p>Пароли не хранятся и не редактируются в этой админке.</p>
    </div>
  `;
}

function renderStats() {
  const counts = ROLE_OPTIONS.map(([role, title]) => [title, profiles.filter((p) => p.role === role && p.is_active).length]);
  const inactive = profiles.filter((p) => !p.is_active).length;
  get('stats').innerHTML = `
    <div class="metrics">
      ${counts.map(([title, count]) => `<div class="metric"><b>${count}</b><span>${esc(title)}</span></div>`).join('')}
      <div class="metric orangeBox"><b>${inactive}</b><span>отключены</span></div>
    </div>
  `;
}

function filteredProfiles() {
  const q = filter.toLowerCase().trim();
  if (!q) return profiles;
  return profiles.filter((p) => [p.full_name, p.email, p.phone, p.team_name, p.position, roleLabel(p.role)].join(' ').toLowerCase().includes(q));
}

function renderProfiles() {
  get('filters').innerHTML = `
    <div class="row">
      <label>Поиск сотрудника<input id="employeeSearch" placeholder="ФИО, email, команда, роль"></label>
    </div>
    <div class="actions" style="justify-content:flex-start">
      <button id="btnReload" class="green">Обновить</button>
      <a class="button light" href="./deals.html">Сделки</a>
      <a class="button light" href="./index.html">Навигатор</a>
    </div>
  `;
  get('employeeSearch').value = filter;
  get('employeeSearch').oninput = (e) => { filter = e.target.value; renderProfilesTable(); };
  get('btnReload').onclick = refresh;
  renderProfilesTable();
}

function renderProfilesTable() {
  const managers = profiles.filter((p) => ['admin', 'manager'].includes(p.role) && p.is_active);
  const rows = filteredProfiles().map((p) => `
    <tr data-profile-row="${p.id}">
      <td><input data-field="full_name" value="${esc(p.full_name || '')}"><br><span class="small">${esc(p.id)}</span></td>
      <td><input data-field="email" value="${esc(p.email || '')}" placeholder="email"><input data-field="phone" value="${esc(p.phone || '')}" placeholder="телефон"></td>
      <td>
        <select data-field="role">${ROLE_OPTIONS.map(([role, title]) => `<option value="${role}" ${p.role === role ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select>
        <input data-field="position" value="${esc(p.position || '')}" placeholder="должность">
      </td>
      <td>
        <input data-field="team_name" value="${esc(p.team_name || '')}" placeholder="команда / отдел">
        <select data-field="manager_id"><option value="">Без руководителя</option>${managers.filter((m) => m.id !== p.id).map((m) => `<option value="${m.id}" ${p.manager_id === m.id ? 'selected' : ''}>${esc(m.full_name)}</option>`).join('')}</select>
        <span class="small">Текущий руководитель: ${esc(profileName(p.manager_id))}</span>
      </td>
      <td><label class="check"><input type="checkbox" data-field="is_active" ${p.is_active ? 'checked' : ''}> Активен</label></td>
      <td><button class="green" data-save-profile="${p.id}">Сохранить</button></td>
    </tr>
  `).join('');

  get('profilesTable').innerHTML = `
    <div class="box blue">
      <h2>Сотрудники и роли</h2>
      <div class="table-wrap"><table>
        <tr><th>ФИО / ID</th><th>Контакты</th><th>Роль / должность</th><th>Команда / руководитель</th><th>Статус</th><th></th></tr>
        ${rows || '<tr><td colspan="6">Сотрудники не найдены.</td></tr>'}
      </table></div>
    </div>
  `;

  document.querySelectorAll('[data-save-profile]').forEach((btn) => {
    btn.onclick = async () => saveProfile(btn.dataset.saveProfile);
  });
}

async function saveProfile(id) {
  const row = document.querySelector(`[data-profile-row="${id}"]`);
  const value = (field) => {
    const input = row.querySelector(`[data-field="${field}"]`);
    if (!input) return '';
    if (input.type === 'checkbox') return input.checked;
    return input.value;
  };

  try {
    setStatus('Сохраняю профиль...', 'info');
    await updateProfile(id, {
      full_name: value('full_name'),
      email: value('email'),
      phone: value('phone'),
      role: value('role'),
      position: value('position'),
      team_name: value('team_name'),
      manager_id: value('manager_id'),
      is_active: value('is_active')
    });
    await refresh();
    setStatus('Профиль сохранен.', 'ok');
  } catch (error) {
    setStatus('Ошибка сохранения: ' + error.message, 'error');
    alert('Ошибка сохранения: ' + error.message);
  }
}

function bindAuth() {
  get('btnLogin').onclick = async () => {
    try {
      setStatus('Выполняю вход...', 'info');
      await signInWithPassword(get('email').value.trim(), get('password').value);
      await refresh();
    } catch (error) {
      setStatus('Ошибка входа: ' + error.message, 'error');
    }
  };

  get('btnLogout').onclick = async () => {
    await signOut();
    await refresh();
  };
}

bindAuth();
refresh().catch((error) => setStatus('Ошибка загрузки: ' + error.message, 'error'));
