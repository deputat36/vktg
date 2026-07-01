import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';

const app = document.getElementById('app');
let profile = null;
let health = null;
let errorText = '';
let busy = false;
let copied = false;

function n(value) { return Number(value || 0); }
function roleName(role) {
  return ({ owner: 'Владелец', admin: 'Администратор', manager: 'Менеджер', spn: 'СПН', lawyer: 'Юрист', broker: 'Брокер', viewer: 'Наблюдатель' })[role] || role || 'не определена';
}
function isAdmin() { return ['owner', 'admin'].includes(profile?.role); }
function checks() { return Array.isArray(health?.checks) ? health.checks : []; }
function problemChecks() { return checks().filter((item) => item.has_problem || n(item.count_value)); }
function severityTone(severity) {
  if (severity === 'error') return 'red';
  if (severity === 'warning') return 'yellow';
  return 'blue';
}
function statusTone() {
  if (errorText) return 'error';
  if (!health) return isAdmin() ? 'warn' : 'error';
  if (!health.ok || n(health.error_count)) return 'error';
  if (n(health.warning_count) || n(health.problem_count)) return 'warn';
  return 'ok';
}
function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}
function fmtDate(value) {
  if (!value) return 'нет данных';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU');
}
function profileLine(item) {
  const name = item.full_name || 'без ФИО';
  const email = item.email || 'без email';
  const role = roleName(item.role);
  const phone = item.phone || 'без телефона';
  const manager = item.manager_name || item.manager_email || (item.manager_id ? 'менеджер не найден' : 'без менеджера');
  return `${name} · ${email} · ${role} · ${phone} · ${manager}`;
}
function sampleRows(sample) {
  if (!Array.isArray(sample) || !sample.length) return '<div class="empty">Выборки нет.</div>';
  return sample.map((item) => {
    if (item && typeof item === 'object') {
      return `<div class="list-item"><b>${esc(item.full_name || item.email || item.id || 'profile')}</b><p class="muted">${esc(profileLine(item))}</p></div>`;
    }
    return `<div class="list-item"><p class="muted">${esc(String(item))}</p></div>`;
  }).join('');
}
function checkRow(item) {
  const tone = item.has_problem ? severityTone(item.severity) : 'green';
  const sample = Array.isArray(item.sample) ? item.sample : [];
  return `<div class="list-item">
    <div class="section-title">
      <div>
        <b>${esc(item.label || item.code || 'Проверка')}</b>
        <span class="small">${esc(item.code || '')}</span>
      </div>
      <span class="pill ${tone}">${esc(item.has_problem ? `${item.severity || 'problem'} · ${n(item.count_value)}` : 'ok')}</span>
    </div>
    ${item.has_problem ? `<div class="list" style="margin-top:8px">${sampleRows(sample)}</div>` : ''}
  </div>`;
}
function rolesSummary() {
  const roles = health?.summary?.roles || {};
  const keys = Object.keys(roles).sort();
  if (!keys.length) return '<div class="empty">Роли не найдены.</div>';
  return keys.map((key) => `<div class="list-item"><div class="section-title"><b>${esc(roleName(key))}</b><span class="pill blue">${esc(String(roles[key]))}</span></div></div>`).join('');
}
function reportText() {
  const summary = health?.summary || {};
  return [
    'CRM Навигатор сделок v2 — качество профилей команды',
    `profile: ${profile?.email || 'unknown'} · ${roleName(profile?.role)}`,
    `checked_at: ${health?.checked_at || ''}`,
    `ok: ${health?.ok === true}`,
    `problem_count: ${n(health?.problem_count)}`,
    `warning_count: ${n(health?.warning_count)}`,
    `error_count: ${n(health?.error_count)}`,
    `active_profiles: ${n(summary.active_profiles)}`,
    `inactive_profiles: ${n(summary.inactive_profiles)}`,
    `active_owner_admin: ${n(summary.active_owner_admin)}`,
    `active_manager_candidates: ${n(summary.active_manager_candidates)}`,
    `active_spn: ${n(summary.active_spn)}`,
    `active_lawyer: ${n(summary.active_lawyer)}`,
    `active_broker: ${n(summary.active_broker)}`,
    `roles: ${JSON.stringify(summary.roles || {})}`,
    '',
    ...problemChecks().map((item) => `${item.code}: ${item.severity}; count=${n(item.count_value)}; sample=${JSON.stringify(item.sample || [])}`)
  ].join('\n');
}
async function copyReport() {
  try {
    await navigator.clipboard.writeText(reportText());
    copied = true;
    draw();
    setTimeout(() => { copied = false; draw(); }, 1400);
  } catch (_) {
    copied = false;
  }
}
function summaryStatus() {
  if (errorText) return errorText;
  if (!health) return isAdmin() ? 'Запустите проверку качества профилей команды.' : 'Проверка доступна только owner/admin.';
  if (!health.ok || n(health.error_count)) return 'Найдены критические ошибки в профилях команды.';
  if (n(health.warning_count) || n(health.problem_count)) return 'Критических ошибок нет, но есть предупреждения по качеству профилей.';
  return 'Качество профилей команды в норме.';
}
function draw() {
  const profileText = profile ? `${esc(profile.email || 'без email')} · ${esc(roleName(profile.role))}` : 'профиль не определен';
  const summary = health?.summary || {};
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Качество профилей команды</h1><p>Проверка менеджеров СПН, телефонов, email, дублей, active owner/admin и корректности manager_id. CRM «Лидер» не используется.</p></section>
    <div class="status ${statusTone()}">${esc(summaryStatus())}</div>
    <section class="card">
      <div class="section-title">
        <div><h2>Проверка</h2><p class="muted">Текущий профиль: ${profileText}</p></div>
        <div class="actions" style="justify-content:flex-end">
          <button id="copyReport" class="btn light" type="button" ${health ? '' : 'disabled'}>${copied ? 'Скопировано' : 'Скопировать отчет'}</button>
          <button id="runCheck" class="btn primary" type="button" ${busy || !isAdmin() ? 'disabled' : ''}>${busy ? 'Проверяю...' : 'Запустить проверку'}</button>
        </div>
      </div>
      <div class="actions" style="justify-content:flex-start"><a class="btn light" href="./diagnostics-v2.html">Диагностика</a><a class="btn light" href="./admin-v2.html">Admin v2</a><a class="btn light" href="./nav-access-v2.html">Ссылки доступа</a></div>
    </section>
    ${health ? `<section class="kpi-row">
      ${metric('Итог', health.ok ? 'OK' : 'FAIL', health.ok ? 'green' : 'red')}
      ${metric('Проблемы', n(health.problem_count), n(health.error_count) ? 'red' : n(health.problem_count) ? 'yellow' : 'green')}
      ${metric('Предупреждения', n(health.warning_count), n(health.warning_count) ? 'yellow' : 'green')}
      ${metric('Ошибки', n(health.error_count), n(health.error_count) ? 'red' : 'green')}
      ${metric('Активные профили', n(summary.active_profiles), 'blue')}
      ${metric('Owner/admin', n(summary.active_owner_admin), n(summary.active_owner_admin) ? 'green' : 'red')}
      ${metric('Manager candidates', n(summary.active_manager_candidates), n(summary.active_manager_candidates) ? 'green' : 'yellow')}
      ${metric('СПН', n(summary.active_spn), 'blue')}
      ${metric('Юристы', n(summary.active_lawyer), 'blue')}
      ${metric('Брокеры', n(summary.active_broker), 'blue')}
    </section>
    <section class="grid">
      <div class="card"><div class="section-title"><div><h2>Проблемные checks</h2><p class="muted">Проверено ${esc(fmtDate(health.checked_at))}</p></div><span class="pill ${n(health.error_count) ? 'red' : n(health.warning_count) ? 'yellow' : 'green'}">${esc(String(n(health.problem_count)))}</span></div><div class="list">${problemChecks().map(checkRow).join('') || '<div class="empty">Проблем не найдено.</div>'}</div></div>
      <div class="card"><div class="section-title"><div><h2>Роли</h2><p class="muted">Распределение активных профилей по ролям.</p></div><span class="pill blue">${esc(String(n(summary.active_profiles)))}</span></div><div class="list">${rolesSummary()}</div></div>
    </section>
    <section class="card"><h2>Все checks</h2><div class="list">${checks().map(checkRow).join('')}</div></section>` : ''}
  </main>`;
  document.getElementById('runCheck')?.addEventListener('click', runCheck);
  document.getElementById('copyReport')?.addEventListener('click', copyReport);
}
async function runCheck() {
  if (busy || !isAdmin()) return;
  busy = true;
  errorText = '';
  draw();
  try {
    health = await rpc('nav_v2_get_team_profile_quality_health', {}, 15000);
  } catch (error) {
    health = null;
    errorText = 'Ошибка проверки качества профилей команды: ' + (error.message || error);
  } finally {
    busy = false;
    draw();
  }
}
async function init() {
  setupTop('diagnostics');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  try {
    const data = await rpc('nav_v2_get_my_profile', {}, 12000);
    profile = data?.profile || null;
  } catch (error) {
    errorText = 'Ошибка проверки профиля: ' + (error.message || error);
  }
  draw();
  if (isAdmin()) await runCheck();
}

init();
