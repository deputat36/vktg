import { getCachedUser, rpc, esc } from './supabase-v2.js';

const app = document.getElementById('app');
let health = null;
let errorText = '';
let loading = false;
let requested = false;

function n(value) { return Number(value || 0); }
function checks() { return Array.isArray(health?.checks) ? health.checks : []; }
function problems() { return checks().filter((item) => item.has_problem); }
function profilesWithoutManager() {
  const check = problems().find((item) => item.code === 'active_spn_without_manager');
  return Array.isArray(check?.sample) ? check.sample : [];
}
function metric(label, value, cls = '') {
  return `<div class="metric ${cls}"><span>${esc(label)}</span><b>${esc(String(value ?? 0))}</b></div>`;
}
function severityClass(severity) {
  if (severity === 'error') return 'red';
  if (severity === 'warning') return 'yellow';
  return 'blue';
}
function sampleLine(item) {
  const sample = Array.isArray(item.sample) ? item.sample : [];
  if (!sample.length) return '';
  return sample.slice(0, 4).map((row) => {
    const name = row.full_name || row.email || row.id || row.code || 'профиль';
    const role = row.role ? ` · ${row.role}` : '';
    const manager = row.manager_name || row.manager_email ? ` · менеджер: ${row.manager_name || row.manager_email}` : '';
    return `<div class="small">${esc(name)}${esc(role)}${esc(manager)}</div>`;
  }).join('');
}
function checkRow(item) {
  return `<div class="list-item">
    <div class="section-title">
      <div><b>${esc(item.label || item.code)}</b>${sampleLine(item)}</div>
      <span class="pill ${severityClass(item.severity)}">${n(item.count_value)}</span>
    </div>
  </div>`;
}
function panelInnerHtml() {
  const summary = health?.summary || {};
  const missingSpnManagers = profilesWithoutManager();
  const status = errorText
    ? `<div class="status error">${esc(errorText)}</div>`
    : health
      ? `<div class="status ${n(health.error_count) ? 'error' : n(health.warning_count) ? 'warn' : 'ok'}">Критичных ошибок: ${n(health.error_count)}. Предупреждений: ${n(health.warning_count)}.</div>`
      : '<div class="status">Проверяю качество профилей команды...</div>';
  const spnManagerWarning = missingSpnManagers.length
    ? `<div class="status warn"><b>СПН без менеджера: ${missingSpnManagers.length}</b>. Выберите менеджера в подсвеченной строке ниже и нажмите «Сохранить роль». <a href="#users-list">Перейти к пользователям</a></div>`
    : '';
  return `
    <div class="section-title">
      <div><h2>Качество профилей команды</h2><p class="muted">Owner/admin health-check по профилям: менеджеры СПН, телефоны, email, дубли и корректность manager_id.</p></div>
      <span class="pill ${health?.ok ? 'green' : errorText ? 'red' : 'yellow'}">${health?.ok ? 'ok' : 'check'}</span>
    </div>
    ${status}
    ${spnManagerWarning}
    <div class="kpi-row">
      ${metric('Активных профилей', summary.active_profiles, 'blue')}
      ${metric('Owner/Admin', summary.active_owner_admin, n(summary.active_owner_admin) ? 'green' : 'red')}
      ${metric('Кандидатов в менеджеры', summary.active_manager_candidates, n(summary.active_manager_candidates) ? 'green' : 'yellow')}
      ${metric('СПН', summary.active_spn, 'blue')}
      ${metric('Юристов', summary.active_lawyer, 'blue')}
      ${metric('Брокеров', summary.active_broker, 'blue')}
      ${metric('Проблемы', health?.problem_count, n(health?.problem_count) ? 'yellow' : 'green')}
      ${metric('Ошибки', health?.error_count, n(health?.error_count) ? 'red' : 'green')}
    </div>
    <div class="grid">
      <div>
        <h3>Нужно проверить</h3>
        <div class="list">${problems().map(checkRow).join('') || '<div class="empty">Проблем качества профилей не найдено.</div>'}</div>
      </div>
      <div>
        <h3>Что делать</h3>
        <div class="list">
          <div class="list-item"><b>СПН без менеджера</b><p class="muted">Назначьте менеджера в таблице пользователей ниже или при создании новой ссылки доступа.</p></div>
          <div class="list-item"><b>Телефон и ФИО</b><p class="muted">Заполните профиль, чтобы команда понимала ответственного и могла связаться с сотрудником.</p></div>
          <div class="list-item"><b>Некорректный manager_id</b><p class="muted">Выберите активного owner/admin/manager. Другие роли не должны быть менеджерами.</p></div>
        </div>
      </div>
    </div>
    <div class="actions" style="justify-content:flex-start"><button id="reloadTeamProfileQuality" class="btn light" type="button">Обновить качество профилей</button><a class="btn light" href="./nav-access-v2.html">Создать доступ</a></div>`;
}
function markUsersWithoutManager() {
  const ids = new Set(profilesWithoutManager().map((row) => row.id).filter(Boolean));
  document.querySelectorAll('[data-manager]').forEach((select) => {
    const id = select.getAttribute('data-manager');
    const item = select.closest('.list-item');
    if (!item) return;
    const oldHint = item.querySelector('[data-team-profile-manager-hint]');
    if (!ids.has(id)) {
      item.style.borderColor = '';
      item.style.boxShadow = '';
      oldHint?.remove();
      return;
    }
    item.style.borderColor = 'rgba(245,158,11,.75)';
    item.style.boxShadow = 'inset 0 0 0 1px rgba(245,158,11,.35)';
    if (!oldHint) {
      item.insertAdjacentHTML('afterbegin', '<div data-team-profile-manager-hint class="status warn" style="margin-bottom:10px">Назначьте менеджера этому активному СПН и нажмите «Сохранить роль».</div>');
    }
  });
}
function mountPanel() {
  const main = app?.querySelector('main.nav-v2-shell');
  if (!main) return;
  let panel = document.getElementById('team-profile-quality-box');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'team-profile-quality-box';
    panel.className = 'card';
    const firstGrid = main.querySelector('section.grid');
    if (firstGrid) main.insertBefore(panel, firstGrid);
    else main.appendChild(panel);
  }
  const html = panelInnerHtml();
  if (panel.innerHTML !== html) panel.innerHTML = html;
  document.getElementById('reloadTeamProfileQuality')?.addEventListener('click', () => loadHealth(true));
  setTimeout(markUsersWithoutManager, 0);
}
async function loadHealth(force = false) {
  if (!getCachedUser() || loading || (requested && !force)) return;
  requested = true;
  loading = true;
  errorText = '';
  mountPanel();
  try {
    health = await rpc('nav_v2_get_team_profile_quality_health', {}, 15000);
  } catch (error) {
    health = null;
    errorText = 'Качество профилей недоступно: ' + (error.message || error);
  } finally {
    loading = false;
    mountPanel();
  }
}

if (app) {
  new MutationObserver(() => {
    if (!document.getElementById('team-profile-quality-box')) mountPanel();
    loadHealth(false);
    markUsersWithoutManager();
  }).observe(app, { childList: true, subtree: true });
  mountPanel();
  loadHealth(false);
}
