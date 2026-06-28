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
function ok(value) { return value === true || value === 'true'; }
function metric(label, value, tone = '') {
  return `<div class="metric ${tone}"><span>${esc(label)}</span><b>${esc(String(value))}</b></div>`;
}
function boolCard(title, isOk, details, href, toneWhenWarn = 'red') {
  return `<div class="list-item">
    <div class="section-title">
      <div><b>${esc(title)}</b><p class="muted">${esc(details || '')}</p></div>
      <span class="pill ${isOk ? 'green' : toneWhenWarn}">${isOk ? 'OK' : 'Проверить'}</span>
    </div>
    ${href ? `<div class="actions" style="justify-content:flex-start;margin-top:8px"><a class="btn light" href="${esc(href)}">Открыть</a></div>` : ''}
  </div>`;
}
function blockers() {
  if (!health) return [];
  const items = [];
  if (!ok(health.security?.ok)) items.push('Security hardening не OK');
  if (!ok(health.rls?.ok)) items.push('RLS policy health не OK');
  if (!ok(health.storage?.ok)) items.push('Storage security не OK');
  if (!ok(health.indexes?.ok)) items.push('Index health не OK');
  if (!ok(health.internal?.ok)) items.push('Internal RPC lockdown не OK');
  if (!ok(health.integrity?.ok)) items.push('Data integrity не OK');
  if (!ok(health.frontend?.ok)) items.push('Frontend RPC coverage не OK');
  if (!ok(health.grants?.ok)) items.push('RPC grant health не OK');
  if (!ok(health.team?.ok) && n(health.team?.error_count)) items.push('Team profile quality имеет критические ошибки');
  return items;
}
function warnings() {
  if (!health) return [];
  const result = [];
  const quality = health.quality?.summary || {};
  if (n(quality.open_quality_tasks)) result.push(`Открытых quality задач: ${n(quality.open_quality_tasks)}`);
  if (n(quality.urgent_quality_tasks)) result.push(`Срочных quality задач: ${n(quality.urgent_quality_tasks)}`);
  if (n(quality.deals_with_issues)) result.push(`Сделок с пробелами: ${n(quality.deals_with_issues)}`);
  if (n(health.team?.problem_count)) result.push(`Проблем качества профилей команды: ${n(health.team.problem_count)}`);
  return result;
}
function overallTone() {
  if (errorText) return 'error';
  if (!health) return isAdmin() ? 'warn' : 'error';
  if (blockers().length) return 'error';
  if (warnings().length) return 'warn';
  return 'ok';
}
function overallText() {
  if (errorText) return errorText;
  if (!health) return isAdmin() ? 'Запустите общий health overview.' : 'Проверка доступна только owner/admin.';
  if (blockers().length) return `Есть блокеры: ${blockers().length}. Откройте детальные диагностики.`;
  if (warnings().length) return `Технических блокеров нет, есть операционные предупреждения: ${warnings().length}.`;
  return 'Операционный health overview в норме.';
}
function reportText() {
  const quality = health?.quality?.summary || {};
  return [
    'CRM Навигатор сделок v2 — operations health overview',
    `profile: ${profile?.email || 'unknown'} · ${roleName(profile?.role)}`,
    `blockers: ${blockers().length}`,
    `warnings: ${warnings().length}`,
    `security_ok: ${ok(health?.security?.ok)}`,
    `rls_ok: ${ok(health?.rls?.ok)}`,
    `storage_ok: ${ok(health?.storage?.ok)}`,
    `index_ok: ${ok(health?.indexes?.ok)}`,
    `internal_ok: ${ok(health?.internal?.ok)}`,
    `integrity_ok: ${ok(health?.integrity?.ok)}`,
    `frontend_ok: ${ok(health?.frontend?.ok)}`,
    `frontend_items_count: ${n(health?.frontend?.items_count)}`,
    `grant_ok: ${ok(health?.grants?.ok)}`,
    `grant_items_count: ${n(health?.grants?.items_count)}`,
    `quality_total_deals: ${n(quality.total_deals)}`,
    `quality_open_quality_tasks: ${n(quality.open_quality_tasks)}`,
    `quality_urgent_quality_tasks: ${n(quality.urgent_quality_tasks)}`,
    `team_ok: ${ok(health?.team?.ok)}`,
    `team_problem_count: ${n(health?.team?.problem_count)}`,
    `team_error_count: ${n(health?.team?.error_count)}`,
    '',
    ...blockers().map((item) => `BLOCKER: ${item}`),
    ...warnings().map((item) => `WARNING: ${item}`)
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
function draw() {
  const profileText = profile ? `${esc(profile.email || 'без email')} · ${esc(roleName(profile.role))}` : 'профиль не определен';
  const quality = health?.quality?.summary || {};
  const block = blockers();
  const warn = warnings();
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Операционный health overview</h1><p>Единый owner/admin экран: security, grants, frontend RPC coverage, качество данных, качество команды и целостность Навигатора. CRM «Лидер» не используется.</p></section>
    <div class="status ${overallTone()}">${esc(overallText())}</div>
    <section class="card">
      <div class="section-title">
        <div><h2>Проверка</h2><p class="muted">Текущий профиль: ${profileText}</p></div>
        <div class="actions" style="justify-content:flex-end">
          <button id="copyReport" class="btn light" type="button" ${health ? '' : 'disabled'}>${copied ? 'Скопировано' : 'Скопировать отчет'}</button>
          <button id="runCheck" class="btn primary" type="button" ${busy || !isAdmin() ? 'disabled' : ''}>${busy ? 'Проверяю...' : 'Запустить overview'}</button>
        </div>
      </div>
      <div class="actions" style="justify-content:flex-start"><a class="btn light" href="./diagnostics-v2.html">Диагностика</a><a class="btn light" href="./security-hardening-check-v2.html">Security</a><a class="btn light" href="./data-quality-check-v2.html">Качество данных</a><a class="btn light" href="./team-profile-quality-check-v2.html">Качество команды</a></div>
    </section>
    ${health ? `<section class="kpi-row">
      ${metric('Блокеры', block.length, block.length ? 'red' : 'green')}
      ${metric('Предупреждения', warn.length, warn.length ? 'yellow' : 'green')}
      ${metric('Security', ok(health.security?.ok) ? 'OK' : 'FAIL', ok(health.security?.ok) ? 'green' : 'red')}
      ${metric('Frontend RPC', n(health.frontend?.items_count), ok(health.frontend?.ok) ? 'green' : 'red')}
      ${metric('RPC grants', n(health.grants?.items_count), ok(health.grants?.ok) ? 'green' : 'red')}
      ${metric('Сделок', n(quality.total_deals), 'blue')}
      ${metric('Quality задач', n(quality.open_quality_tasks), n(quality.open_quality_tasks) ? 'yellow' : 'green')}
      ${metric('Срочных quality', n(quality.urgent_quality_tasks), n(quality.urgent_quality_tasks) ? 'red' : 'green')}
      ${metric('Team errors', n(health.team?.error_count), n(health.team?.error_count) ? 'red' : 'green')}
    </section>
    <section class="grid">
      <div class="card"><h2>Технический контур</h2><div class="list">
        ${boolCard('Security hardening', ok(health.security?.ok), `tables=${health.security?.tables?.checked_count ?? 'n/a'}; functions=${health.security?.functions?.checked_count ?? 'n/a'}`, './security-hardening-check-v2.html')}
        ${boolCard('RLS policies', ok(health.rls?.ok), `policies=${health.rls?.policy_count ?? 'n/a'}; problems=${health.rls?.problem_count ?? 'n/a'}`, './security-hardening-check-v2.html')}
        ${boolCard('Storage security', ok(health.storage?.ok), `buckets=${health.storage?.bucket_count ?? 'n/a'}; public=${health.storage?.public_bucket_count ?? 'n/a'}`, './security-hardening-check-v2.html')}
        ${boolCard('Indexes', ok(health.indexes?.ok), `expected=${health.indexes?.expected_count ?? 'n/a'}; missing=${health.indexes?.missing_count ?? 'n/a'}`, './security-hardening-check-v2.html')}
        ${boolCard('Internal RPC lockdown', ok(health.internal?.ok), `items=${health.internal?.items_count ?? 'n/a'}; open=${health.internal?.open_count ?? 'n/a'}`, './security-hardening-check-v2.html')}
        ${boolCard('Data integrity', ok(health.integrity?.ok), `checks=${health.integrity?.check_count ?? 'n/a'}; problems=${health.integrity?.problem_count ?? 'n/a'}`, './security-hardening-check-v2.html')}
        ${boolCard('Frontend RPC coverage', ok(health.frontend?.ok), `items=${n(health.frontend?.items_count)}; problems=${n(health.frontend?.problem_count)}`, './frontend-rpc-coverage-check-v2.html')}
        ${boolCard('RPC grants', ok(health.grants?.ok), `items=${n(health.grants?.items_count)}; anon=${n(health.grants?.anon_open_count)}; public=${n(health.grants?.public_open_count)}`, './rpc-grant-check-v2.html')}
      </div></div>
      <div class="card"><h2>Операционный контур</h2><div class="list">
        ${boolCard('Качество данных сделок', n(quality.urgent_quality_tasks) === 0, `deals=${n(quality.total_deals)}; issues=${n(quality.deals_with_issues)}; quality=${n(quality.open_quality_tasks)}; urgent=${n(quality.urgent_quality_tasks)}`, './data-quality-check-v2.html', 'yellow')}
        ${boolCard('Качество профилей команды', ok(health.team?.ok) && n(health.team?.error_count) === 0, `problems=${n(health.team?.problem_count)}; warnings=${n(health.team?.warning_count)}; errors=${n(health.team?.error_count)}`, './team-profile-quality-check-v2.html', 'yellow')}
        <div class="list-item"><b>Блокеры</b><p class="muted">${block.map(esc).join('; ') || 'Блокеров нет.'}</p></div>
        <div class="list-item"><b>Предупреждения</b><p class="muted">${warn.map(esc).join('; ') || 'Предупреждений нет.'}</p></div>
      </div></div>
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
    const [security, rls, storage, indexes, internal, integrity, quality, team, frontend, grants] = await Promise.all([
      rpc('nav_v2_get_security_hardening_health', {}, 20000),
      rpc('nav_v2_get_rls_policy_health', {}, 20000),
      rpc('nav_v2_get_storage_security_health', {}, 20000),
      rpc('nav_v2_get_index_health', {}, 20000),
      rpc('nav_v2_get_internal_rpc_lockdown_health', {}, 20000),
      rpc('nav_v2_get_data_integrity_health', {}, 20000),
      rpc('nav_v2_get_data_quality_dashboard', { p_limit: 20 }, 20000),
      rpc('nav_v2_get_team_profile_quality_health', {}, 20000),
      rpc('nav_v2_get_frontend_rpc_coverage_health', {}, 20000),
      rpc('nav_v2_get_rpc_grant_health', {}, 20000)
    ]);
    health = { security, rls, storage, indexes, internal, integrity, quality, team, frontend, grants };
  } catch (error) {
    health = null;
    errorText = 'Ошибка operations health overview: ' + (error.message || error);
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
