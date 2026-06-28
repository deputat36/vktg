import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';

const app = document.getElementById('app');
let profile = null;
let result = null;
let errorText = '';
let isLoading = false;
let copied = false;

function roleName(role) {
  return ({ owner: 'Владелец', admin: 'Администратор', manager: 'Менеджер', spn: 'СПН', lawyer: 'Юрист', broker: 'Брокер', viewer: 'Наблюдатель' })[role] || role || 'не определена';
}

function isAdmin() {
  return ['owner', 'admin'].includes(profile?.role);
}

function fmtDate(value) {
  if (!value) return 'нет данных';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU');
}

function metric(label, value, tone = '') {
  return `<div class="list-item">
    <div class="section-title">
      <div><b>${esc(label)}</b></div>
      <span class="pill ${tone}">${esc(String(value))}</span>
    </div>
  </div>`;
}

function problemRow(item, type) {
  if (type === 'table') {
    const anon = item.anon || {};
    const pub = item.public || {};
    return `<div class="list-item">
      <b>${esc(item.table_name || 'unknown')}</b>
      <p class="muted">RLS: ${item.rls_enabled ? 'on' : 'off'} · force RLS: ${item.force_rls ? 'on' : 'off'}</p>
      <p class="muted">anon: ${esc(JSON.stringify(anon))}</p>
      <p class="muted">PUBLIC: ${esc(JSON.stringify(pub))}</p>
    </div>`;
  }
  return `<div class="list-item">
    <b>${esc(item.function_name || 'unknown')}(${esc(item.identity_args || '')})</b>
    <p class="muted">SECURITY DEFINER: ${item.security_definer ? 'yes' : 'no'} · auth.uid(): ${item.has_auth_uid_check ? 'yes' : 'no'} · owner/admin: ${item.has_owner_admin_check ? 'yes' : 'no'}</p>
    <p class="muted">anon_execute=${item.anon_execute ? 'true' : 'false'} · public_execute=${item.public_execute ? 'true' : 'false'} · authenticated_execute=${item.authenticated_execute ? 'true' : 'false'}</p>
  </div>`;
}

function problemList(title, items, type) {
  if (!items?.length) {
    return `<section class="card"><div class="section-title"><div><h2>${esc(title)}</h2><p class="muted">Проблем не найдено.</p></div><span class="pill ok">0</span></div></section>`;
  }
  return `<section class="card">
    <div class="section-title"><div><h2>${esc(title)}</h2><p class="muted">Нужно исправить права или RLS.</p></div><span class="pill red">${items.length}</span></div>
    <div class="list">${items.map((item) => problemRow(item, type)).join('')}</div>
  </section>`;
}

function buildReport() {
  if (!result) return 'Security hardening health: нет данных';
  return [
    `Security hardening health: ${result.ok ? 'OK' : 'PROBLEMS'}`,
    `checked_at: ${result.checked_at || ''}`,
    `tables.checked_count: ${result.tables?.checked_count ?? 0}`,
    `tables.rls_disabled_count: ${result.tables?.rls_disabled_count ?? 0}`,
    `tables.anon_or_public_open_count: ${result.tables?.anon_or_public_open_count ?? 0}`,
    `functions.checked_count: ${result.functions?.checked_count ?? 0}`,
    `functions.security_definer_count: ${result.functions?.security_definer_count ?? 0}`,
    `functions.anon_or_public_open_count: ${result.functions?.anon_or_public_open_count ?? 0}`,
    `table_problems: ${JSON.stringify(result.tables?.problems || [])}`,
    `function_problems: ${JSON.stringify(result.functions?.problems || [])}`
  ].join('\n');
}

async function copyReport() {
  try {
    await navigator.clipboard.writeText(buildReport());
    copied = true;
    draw();
    setTimeout(() => { copied = false; draw(); }, 1500);
  } catch (_) {
    copied = false;
  }
}

function draw() {
  const profileLine = profile
    ? `${esc(profile.email || 'без email')} · ${esc(roleName(profile.role))} · ${profile.is_active ? 'активен' : 'статус уточняется'}`
    : 'профиль не определен';
  const tables = result?.tables || {};
  const functions = result?.functions || {};
  const statusClass = errorText ? 'error' : result?.ok ? 'ok' : result ? 'warn' : 'warn';
  const statusText = errorText || (result ? `Security hardening: ${result.ok ? 'OK' : 'есть проблемы'} · проверено ${esc(fmtDate(result.checked_at))}` : `Текущий профиль: ${profileLine}`);

  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero">
      <h1>Security hardening</h1>
      <p>Проверка RLS и прямых grants для таблиц и функций Навигатора. CRM «Лидер» не используется.</p>
    </section>
    <div class="status ${statusClass}">${statusText}</div>
    <section class="card">
      <div class="section-title">
        <div><h2>Проверка</h2><p class="muted">Доступна только owner/admin. Данные читаются через RPC `nav_v2_get_security_hardening_health()`.</p></div>
        <span class="pill ${isAdmin() ? 'blue' : 'yellow'}">${isAdmin() ? 'owner/admin' : 'restricted'}</span>
      </div>
      <div class="actions" style="justify-content:flex-start;margin-top:8px">
        <button id="runCheck" class="btn primary" type="button" ${isLoading || !isAdmin() ? 'disabled' : ''}>${isLoading ? 'Проверяю...' : 'Запустить проверку'}</button>
        <button id="copyReport" class="btn light" type="button" ${!result ? 'disabled' : ''}>${copied ? 'Скопировано' : 'Скопировать отчет'}</button>
        <a class="btn light" href="./diagnostics-v2.html">К диагностике</a>
      </div>
    </section>
    ${result ? `<section class="grid">
      <div class="card">
        <div class="section-title"><div><h2>Таблицы</h2><p class="muted">RLS и прямые права ` + '`anon`/`PUBLIC`' + `.</p></div><span class="pill ${Number(tables.anon_or_public_open_count || 0) || Number(tables.rls_disabled_count || 0) ? 'red' : 'ok'}">${Number(tables.checked_count || 0)}</span></div>
        <div class="list">
          ${metric('RLS выключен', tables.rls_disabled_count ?? 0, Number(tables.rls_disabled_count || 0) ? 'red' : 'ok')}
          ${metric('Открытые anon/PUBLIC grants', tables.anon_or_public_open_count ?? 0, Number(tables.anon_or_public_open_count || 0) ? 'red' : 'ok')}
        </div>
      </div>
      <div class="card">
        <div class="section-title"><div><h2>Функции</h2><p class="muted">EXECUTE для ` + '`anon`/`PUBLIC`' + ` и SECURITY DEFINER.</p></div><span class="pill ${Number(functions.anon_or_public_open_count || 0) ? 'red' : 'ok'}">${Number(functions.checked_count || 0)}</span></div>
        <div class="list">
          ${metric('SECURITY DEFINER функций', functions.security_definer_count ?? 0, 'blue')}
          ${metric('Открытые anon/PUBLIC EXECUTE', functions.anon_or_public_open_count ?? 0, Number(functions.anon_or_public_open_count || 0) ? 'red' : 'ok')}
        </div>
      </div>
    </section>
    ${problemList('Проблемные таблицы', tables.problems || [], 'table')}
    ${problemList('Проблемные функции', functions.problems || [], 'function')}` : ''}
  </main>`;

  document.getElementById('runCheck')?.addEventListener('click', runCheck);
  document.getElementById('copyReport')?.addEventListener('click', copyReport);
}

async function runCheck() {
  if (isLoading || !isAdmin()) return;
  isLoading = true;
  errorText = '';
  draw();
  try {
    result = await rpc('nav_v2_get_security_hardening_health', {}, 20000);
  } catch (error) {
    errorText = 'Ошибка проверки: ' + (error.message || error);
  } finally {
    isLoading = false;
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
