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
  return `<div class="list-item"><div class="section-title"><div><b>${esc(label)}</b></div><span class="pill ${tone}">${esc(String(value))}</span></div></div>`;
}

function problemRow(item, type) {
  if (type === 'table') {
    const anon = item.anon || {};
    const pub = item.public || {};
    return `<div class="list-item"><b>${esc(item.table_name || 'unknown')}</b><p class="muted">RLS: ${item.rls_enabled ? 'on' : 'off'} · force RLS: ${item.force_rls ? 'on' : 'off'}</p><p class="muted">anon: ${esc(JSON.stringify(anon))}</p><p class="muted">PUBLIC: ${esc(JSON.stringify(pub))}</p></div>`;
  }
  if (type === 'view') {
    return `<div class="list-item"><b>${esc(item.view_name || 'unknown')}</b><p class="muted">type: ${esc(item.kind || 'view')} · reason: ${esc(item.reason || 'unknown')}</p><p class="muted">security_invoker=${item.security_invoker ? 'true' : 'false'} · anon_select=${item.anon_select ? 'true' : 'false'} · public_select=${item.public_select ? 'true' : 'false'} · authenticated_select=${item.authenticated_select ? 'true' : 'false'}</p></div>`;
  }
  if (type === 'storage') {
    return `<div class="list-item"><b>${esc(item.name || item.id || 'unknown')}</b><p class="muted">reason: ${esc(item.reason || 'unknown')} · public=${item.public ? 'true' : 'false'} · referenced policies=${esc(String(item.referenced_policy_count ?? 0))}</p><p class="muted">file_size_limit=${esc(String(item.file_size_limit ?? 'not set'))} · mime=${esc(JSON.stringify(item.allowed_mime_types || []))}</p></div>`;
  }
  if (type === 'rls') {
    return `<div class="list-item"><b>${esc(item.tablename || item.table_name || 'unknown')}</b><p class="muted">policy: ${esc(item.policyname || 'table finding')} · reason: ${esc(item.reason || 'unknown')}</p><p class="muted">cmd=${esc(item.cmd || '')} · roles=${esc(JSON.stringify(item.roles || []))}</p></div>`;
  }
  if (type === 'index') {
    return `<div class="list-item"><b>${esc(item.index_name || 'unknown')}</b><p class="muted">table: ${esc(item.table_name || 'unknown')} · severity: ${esc(item.severity || 'warning')}</p><p class="muted">exists=${item.exists_in_db ? 'true' : 'false'} · valid=${item.is_valid ? 'true' : 'false'} · ready=${item.is_ready ? 'true' : 'false'} · unique=${item.is_unique ? 'true' : 'false'}</p><p class="muted">${esc(item.purpose || '')}</p></div>`;
  }
  return `<div class="list-item"><b>${esc(item.function_name || 'unknown')}(${esc(item.identity_args || '')})</b><p class="muted">SECURITY DEFINER: ${item.security_definer ? 'yes' : 'no'} · auth.uid(): ${item.has_auth_uid_check ? 'yes' : 'no'} · owner/admin: ${item.has_owner_admin_check ? 'yes' : 'no'}</p><p class="muted">anon_execute=${item.anon_execute ? 'true' : 'false'} · public_execute=${item.public_execute ? 'true' : 'false'} · authenticated_execute=${item.authenticated_execute ? 'true' : 'false'}</p></div>`;
}

function problemList(title, items, type) {
  if (!items?.length) {
    return `<section class="card"><div class="section-title"><div><h2>${esc(title)}</h2><p class="muted">Проблем не найдено.</p></div><span class="pill ok">0</span></div></section>`;
  }
  return `<section class="card"><div class="section-title"><div><h2>${esc(title)}</h2><p class="muted">Нужно исправить права, RLS, policy, storage или индексное покрытие.</p></div><span class="pill red">${items.length}</span></div><div class="list">${items.map((item) => problemRow(item, type)).join('')}</div></section>`;
}

function overallOk() {
  return Boolean(result?.ok && (result.storage?.ok ?? true) && (result.rls?.ok ?? true) && (result.indexes?.ok ?? true));
}

function buildReport() {
  if (!result) return 'Security hardening health: нет данных';
  const storage = result.storage || {};
  const rls = result.rls || {};
  const indexes = result.indexes || {};
  const indexFindings = (indexes.expected_indexes || []).filter((item) => !item.exists_in_db || !item.is_valid);
  return [
    `Security hardening health: ${overallOk() ? 'OK' : 'PROBLEMS'}`,
    `checked_at: ${result.checked_at || ''}`,
    `tables.checked_count: ${result.tables?.checked_count ?? 0}`,
    `tables.rls_disabled_count: ${result.tables?.rls_disabled_count ?? 0}`,
    `tables.anon_or_public_open_count: ${result.tables?.anon_or_public_open_count ?? 0}`,
    `rls.table_count: ${rls.table_count ?? 0}`,
    `rls.policy_count: ${rls.policy_count ?? 0}`,
    `rls.problem_count: ${rls.problem_count ?? 0}`,
    `rls.tables_without_policies_count: ${rls.tables_without_policies_count ?? 0}`,
    `views.checked_count: ${result.views?.checked_count ?? 0}`,
    `views.security_invoker_count: ${result.views?.security_invoker_count ?? 0}`,
    `views.anon_or_public_open_count: ${result.views?.anon_or_public_open_count ?? 0}`,
    `views.authenticated_non_invoker_view_count: ${result.views?.authenticated_non_invoker_view_count ?? 0}`,
    `views.authenticated_materialized_view_count: ${result.views?.authenticated_materialized_view_count ?? 0}`,
    `storage.bucket_count: ${storage.bucket_count ?? 0}`,
    `storage.public_bucket_count: ${storage.public_bucket_count ?? 0}`,
    `storage.object_policy_count: ${storage.object_policy_count ?? 0}`,
    `storage.nav_related_bucket_count: ${storage.nav_related_bucket_count ?? 0}`,
    `storage.nav_related_public_count: ${storage.nav_related_public_count ?? 0}`,
    `storage.nav_related_without_specific_policy_count: ${storage.nav_related_without_specific_policy_count ?? 0}`,
    `indexes.expected_count: ${indexes.expected_count ?? 0}`,
    `indexes.missing_count: ${indexes.missing_count ?? 0}`,
    `indexes.invalid_count: ${indexes.invalid_count ?? 0}`,
    `indexes.problem_count: ${indexes.problem_count ?? 0}`,
    `functions.checked_count: ${result.functions?.checked_count ?? 0}`,
    `functions.security_definer_count: ${result.functions?.security_definer_count ?? 0}`,
    `functions.anon_or_public_open_count: ${result.functions?.anon_or_public_open_count ?? 0}`,
    `table_problems: ${JSON.stringify(result.tables?.problems || [])}`,
    `rls_policy_findings: ${JSON.stringify(rls.policy_findings || [])}`,
    `rls_table_findings: ${JSON.stringify(rls.table_findings || [])}`,
    `view_problems: ${JSON.stringify(result.views?.problems || [])}`,
    `storage_problems: ${JSON.stringify(storage.problems || [])}`,
    `index_problems: ${JSON.stringify(indexFindings)}`,
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
  const rls = result?.rls || {};
  const views = result?.views || {};
  const storage = result?.storage || {};
  const indexes = result?.indexes || {};
  const functions = result?.functions || {};
  const rlsProblemCount = Number(rls.problem_count || 0);
  const viewProblemCount = Number(views.anon_or_public_open_count || 0) + Number(views.authenticated_non_invoker_view_count || 0) + Number(views.authenticated_materialized_view_count || 0);
  const storageProblemCount = Number(storage.nav_related_public_count || 0) + Number(storage.nav_related_without_specific_policy_count || 0);
  const indexFindings = (indexes.expected_indexes || []).filter((item) => !item.exists_in_db || !item.is_valid);
  const indexProblemCount = Number(indexes.problem_count || indexFindings.length || 0);
  const isOk = overallOk();
  const statusClass = errorText ? 'error' : isOk ? 'ok' : result ? 'warn' : 'warn';
  const statusText = errorText || (result ? `Security hardening: ${isOk ? 'OK' : 'есть проблемы'} · проверено ${esc(fmtDate(result.checked_at))}` : `Текущий профиль: ${profileLine}`);

  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Security hardening</h1><p>Проверка RLS, policies, views, Storage, индексов и прямых grants для Навигатора. CRM «Лидер» не используется.</p></section>
    <div class="status ${statusClass}">${statusText}</div>
    <section class="card">
      <div class="section-title"><div><h2>Проверка</h2><p class="muted">Доступна только owner/admin. Данные читаются через security, RLS policy, Storage и Index health RPC.</p></div><span class="pill ${isAdmin() ? 'blue' : 'yellow'}">${isAdmin() ? 'owner/admin' : 'restricted'}</span></div>
      <div class="actions" style="justify-content:flex-start;margin-top:8px"><button id="runCheck" class="btn primary" type="button" ${isLoading || !isAdmin() ? 'disabled' : ''}>${isLoading ? 'Проверяю...' : 'Запустить проверку'}</button><button id="copyReport" class="btn light" type="button" ${!result ? 'disabled' : ''}>${copied ? 'Скопировано' : 'Скопировать отчет'}</button><a class="btn light" href="./diagnostics-v2.html">К диагностике</a></div>
    </section>
    ${result ? `<section class="grid">
      <div class="card"><div class="section-title"><div><h2>Таблицы</h2><p class="muted">RLS и прямые права anon/PUBLIC.</p></div><span class="pill ${Number(tables.anon_or_public_open_count || 0) || Number(tables.rls_disabled_count || 0) ? 'red' : 'ok'}">${Number(tables.checked_count || 0)}</span></div><div class="list">${metric('RLS выключен', tables.rls_disabled_count ?? 0, Number(tables.rls_disabled_count || 0) ? 'red' : 'ok')}${metric('Открытые anon/PUBLIC grants', tables.anon_or_public_open_count ?? 0, Number(tables.anon_or_public_open_count || 0) ? 'red' : 'ok')}</div></div>
      <div class="card"><div class="section-title"><div><h2>RLS policies</h2><p class="muted">Качество policies и опасные predicates.</p></div><span class="pill ${rlsProblemCount ? 'red' : 'ok'}">${Number(rls.policy_count || 0)}</span></div><div class="list">${metric('Таблиц проверено', rls.table_count ?? 0, 'blue')}${metric('Policies проверено', rls.policy_count ?? 0, 'blue')}${metric('Проблемы policies', rls.problem_count ?? 0, rlsProblemCount ? 'red' : 'ok')}${metric('Таблицы без policies', rls.tables_without_policies_count ?? 0, Number(rls.tables_without_policies_count || 0) ? 'yellow' : 'ok')}</div></div>
      <div class="card"><div class="section-title"><div><h2>Views</h2><p class="muted">security_invoker и SELECT grants.</p></div><span class="pill ${viewProblemCount ? 'red' : 'ok'}">${Number(views.checked_count || 0)}</span></div><div class="list">${metric('security_invoker views', views.security_invoker_count ?? 0, 'blue')}${metric('Открытые anon/PUBLIC SELECT', views.anon_or_public_open_count ?? 0, Number(views.anon_or_public_open_count || 0) ? 'red' : 'ok')}${metric('Authenticated без security_invoker', views.authenticated_non_invoker_view_count ?? 0, Number(views.authenticated_non_invoker_view_count || 0) ? 'red' : 'ok')}${metric('Authenticated materialized views', views.authenticated_materialized_view_count ?? 0, Number(views.authenticated_materialized_view_count || 0) ? 'red' : 'ok')}</div></div>
      <div class="card"><div class="section-title"><div><h2>Storage</h2><p class="muted">Buckets и policies для документов Навигатора.</p></div><span class="pill ${storageProblemCount ? 'red' : 'ok'}">${Number(storage.bucket_count || 0)}</span></div><div class="list">${metric('Публичные buckets всего', storage.public_bucket_count ?? 0, Number(storage.public_bucket_count || 0) ? 'yellow' : 'ok')}${metric('Storage object policies', storage.object_policy_count ?? 0, 'blue')}${metric('Nav-related buckets', storage.nav_related_bucket_count ?? 0, 'blue')}${metric('Nav-related public buckets', storage.nav_related_public_count ?? 0, Number(storage.nav_related_public_count || 0) ? 'red' : 'ok')}${metric('Nav-related buckets без policy', storage.nav_related_without_specific_policy_count ?? 0, Number(storage.nav_related_without_specific_policy_count || 0) ? 'red' : 'ok')}</div></div>
      <div class="card"><div class="section-title"><div><h2>Indexes</h2><p class="muted">Покрытие горячих путей RLS/RPC и auto-quality задач.</p></div><span class="pill ${indexProblemCount ? 'red' : 'ok'}">${Number(indexes.expected_count || 0)}</span></div><div class="list">${metric('Ожидаемые индексы', indexes.expected_count ?? 0, 'blue')}${metric('Отсутствуют', indexes.missing_count ?? 0, Number(indexes.missing_count || 0) ? 'red' : 'ok')}${metric('Invalid', indexes.invalid_count ?? 0, Number(indexes.invalid_count || 0) ? 'red' : 'ok')}</div></div>
      <div class="card"><div class="section-title"><div><h2>Функции</h2><p class="muted">EXECUTE для anon/PUBLIC и SECURITY DEFINER.</p></div><span class="pill ${Number(functions.anon_or_public_open_count || 0) ? 'red' : 'ok'}">${Number(functions.checked_count || 0)}</span></div><div class="list">${metric('SECURITY DEFINER функций', functions.security_definer_count ?? 0, 'blue')}${metric('Открытые anon/PUBLIC EXECUTE', functions.anon_or_public_open_count ?? 0, Number(functions.anon_or_public_open_count || 0) ? 'red' : 'ok')}</div></div>
    </section>
    ${problemList('Проблемные таблицы', tables.problems || [], 'table')}
    ${problemList('Проблемные RLS policies', [...(rls.policy_findings || []), ...(rls.table_findings || [])], 'rls')}
    ${problemList('Проблемные views', views.problems || [], 'view')}
    ${problemList('Проблемные Storage buckets', storage.problems || [], 'storage')}
    ${problemList('Проблемные индексы', indexFindings, 'index')}
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
    const [security, rls, storage, indexes] = await Promise.all([
      rpc('nav_v2_get_security_hardening_health', {}, 20000),
      rpc('nav_v2_get_rls_policy_health', {}, 20000),
      rpc('nav_v2_get_storage_security_health', {}, 20000),
      rpc('nav_v2_get_index_health', {}, 20000)
    ]);
    result = { ...security, rls, storage, indexes };
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
