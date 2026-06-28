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
function items() { return Array.isArray(health?.items) ? health.items : []; }
function problems() { return items().filter((item) => item.problem); }
function boolPill(value, yes, no) {
  return `<span class="pill ${value ? 'green' : 'red'}">${esc(value ? yes : no)}</span>`;
}
function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}
function itemRow(item) {
  const ok = !item.problem;
  const signatures = Array.isArray(item.signatures) ? item.signatures.join('; ') : '';
  return `<div class="list-item">
    <div class="section-title">
      <div>
        <b>${esc(item.function_name || 'unknown')}</b>
        <span class="small">${esc(item.source_label || '')}${signatures ? ' · ' + esc(signatures) : ''}</span>
      </div>
      <span class="pill ${ok ? 'green' : 'red'}">${esc(ok ? 'ok' : item.problem)}</span>
    </div>
    <div class="actions" style="justify-content:flex-start;margin-top:8px">
      ${boolPill(item.exists_in_db, 'exists', 'missing')}
      ${boolPill(item.authenticated_can_execute, 'authenticated', 'no authenticated')}
      ${boolPill(!item.anon_can_execute, 'anon closed', 'anon open')}
      ${boolPill(!item.public_can_execute, 'PUBLIC closed', 'PUBLIC open')}
      ${boolPill(item.in_rpc_grant_health, 'in grant health', 'not in grant health')}
    </div>
  </div>`;
}
function reportText() {
  return [
    'CRM Навигатор сделок v2 — Frontend RPC coverage',
    `profile: ${profile?.email || 'unknown'} · ${roleName(profile?.role)}`,
    `ok: ${health?.ok === true}`,
    `items_count: ${n(health?.items_count)}`,
    `problem_count: ${n(health?.problem_count)}`,
    `missing_count: ${n(health?.missing_count)}`,
    `missing_authenticated_count: ${n(health?.missing_authenticated_count)}`,
    `anon_open_count: ${n(health?.anon_open_count)}`,
    `public_open_count: ${n(health?.public_open_count)}`,
    `not_in_grant_health_count: ${n(health?.not_in_grant_health_count)}`,
    '',
    ...problems().map((item) => `${item.function_name}: ${item.problem}; signatures=${JSON.stringify(item.signatures || [])}`)
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
function summary() {
  if (errorText) return `<div class="status error">${esc(errorText)}</div>`;
  if (!health) return `<div class="status ${isAdmin() ? 'warn' : 'error'}">${isAdmin() ? 'Запустите проверку frontend RPC.' : 'Проверка доступна только owner/admin.'}</div>`;
  return `<div class="status ${health.ok ? 'ok' : 'error'}">${health.ok ? 'Frontend RPC coverage в норме.' : 'Найдены проблемы frontend RPC coverage.'}</div>`;
}
function draw() {
  const profileLine = profile ? `${esc(profile.email || 'без email')} · ${esc(roleName(profile.role))}` : 'профиль не определен';
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Frontend RPC coverage</h1><p>Сверка RPC, которые реально вызывает браузерный интерфейс Навигатора, с live Supabase функциями, grants и центральным RPC grant health.</p></section>
    ${summary()}
    <section class="card">
      <div class="section-title">
        <div><h2>Проверка</h2><p class="muted">Текущий профиль: ${profileLine}</p></div>
        <div class="actions" style="justify-content:flex-end">
          <button id="copyReport" class="btn light" type="button" ${health ? '' : 'disabled'}>${copied ? 'Скопировано' : 'Скопировать отчет'}</button>
          <button id="runCheck" class="btn primary" type="button" ${busy || !isAdmin() ? 'disabled' : ''}>${busy ? 'Проверяю...' : 'Запустить проверку'}</button>
        </div>
      </div>
      <div class="actions" style="justify-content:flex-start"><a class="btn light" href="./diagnostics-v2.html">Диагностика</a><a class="btn light" href="./rpc-grant-check-v2.html">RPC grants</a><a class="btn light" href="./security-hardening-check-v2.html">Security hardening</a></div>
    </section>
    ${health ? `<section class="kpi-row">
      ${metric('Итог', health.ok ? 'OK' : 'FAIL', health.ok ? 'green' : 'red')}
      ${metric('Frontend RPC', n(health.items_count), 'blue')}
      ${metric('Проблемы', n(health.problem_count), n(health.problem_count) ? 'red' : 'green')}
      ${metric('Нет функции', n(health.missing_count), n(health.missing_count) ? 'red' : 'green')}
      ${metric('Нет authenticated', n(health.missing_authenticated_count), n(health.missing_authenticated_count) ? 'red' : 'green')}
      ${metric('Открыто anon', n(health.anon_open_count), n(health.anon_open_count) ? 'red' : 'green')}
      ${metric('Открыто PUBLIC', n(health.public_open_count), n(health.public_open_count) ? 'red' : 'green')}
      ${metric('Не в grant-health', n(health.not_in_grant_health_count), n(health.not_in_grant_health_count) ? 'red' : 'green')}
    </section>
    <section class="grid">
      <div class="card"><h2>Проблемы</h2><div class="list">${problems().map(itemRow).join('') || '<div class="empty">Проблем не найдено.</div>'}</div></div>
      <div class="card"><h2>Все frontend RPC</h2><div class="list">${items().map(itemRow).join('')}</div></div>
    </section>` : ''}
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
    health = await rpc('nav_v2_get_frontend_rpc_coverage_health', {}, 15000);
  } catch (error) {
    health = null;
    errorText = 'Ошибка frontend RPC coverage: ' + (error.message || error);
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
