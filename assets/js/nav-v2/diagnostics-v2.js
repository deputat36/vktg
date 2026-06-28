import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';

const app = document.getElementById('app');
let profile = null;
let errorText = '';

function roleName(role) {
  return ({ owner: 'Владелец', admin: 'Администратор', manager: 'Менеджер', spn: 'СПН', lawyer: 'Юрист', broker: 'Брокер', viewer: 'Наблюдатель' })[role] || role || 'не определена';
}
function isAdmin() { return ['owner', 'admin'].includes(profile?.role); }
function card(title, text, href, tag = '', adminOnly = false) {
  const locked = adminOnly && !isAdmin();
  const pill = tag ? `<span class="pill ${locked ? 'yellow' : 'blue'}">${esc(locked ? 'owner/admin' : tag)}</span>` : '';
  return `<div class="list-item">
    <div class="section-title">
      <div><b>${esc(title)}</b><p class="muted">${esc(text)}</p></div>
      ${pill}
    </div>
    <div class="actions" style="justify-content:flex-start;margin-top:8px">
      ${locked ? '<button class="btn light" type="button" disabled>Недоступно для роли</button>' : `<a class="btn primary" href="${esc(href)}">Открыть</a>`}
    </div>
  </div>`;
}
function adminCards() {
  return [
    card('Operations health overview', 'Единый owner/admin экран: security, grants, frontend RPC coverage, качество данных, качество команды и целостность.', './operations-health-check-v2.html', 'overview', true),
    card('Security hardening', 'Проверяет RLS таблиц и прямые grants функций/таблиц Навигатора для anon/PUBLIC.', './security-hardening-check-v2.html', 'security', true),
    card('Frontend RPC coverage', 'Сверяет RPC, которые реально вызывает фронт, с live функциями Supabase, grants и центральным grant-health.', './frontend-rpc-coverage-check-v2.html', 'coverage', true),
    card('Качество данных сделок', 'Показывает пробелы карточек, auto-quality задачи, срочные проблемы и топ сделок для исправления.', './data-quality-check-v2.html', 'data', true),
    card('Качество профилей команды', 'Проверяет активных СПН без менеджера, телефоны, email, дубли, owner/admin и корректность manager_id.', './team-profile-quality-check-v2.html', 'team', true),
    card('Диагностика доступа к сделке', 'Проверяет пользователя, сделку, участников, access signals и smoke по lite/full карточке.', './deal-access-check-v2.html', 'доступ', true),
    card('RPC grants', 'Показывает missing authenticated, open anon, open PUBLIC, demo RPC и список проблемных функций.', './rpc-grant-check-v2.html', 'security', true),
    card('Команда и качество данных', 'Админка с блоками качества данных, пользователями, демо-набором и диагностикой доступа.', './admin-v2.html', 'admin', true),
    card('Диагностика карточки', 'Техническая проверка карточки сделки и загрузки deal-card-v2.', './deal-card-diag-v2.html', 'card', true)
  ].join('');
}
function commonCards() {
  return [
    card('Проверка системы', 'Сессия, роль, Supabase, список сделок, страницы, grants для owner/admin и Edge Function dry-run.', './nav-system-check-v2.html', 'system'),
    card('Проверка карточки по ID', 'Быстрая проверка открытия конкретной карточки сделки по id.', './deal-card-check-v2.html', 'card'),
    card('Рабочий стол', 'Основной вход в рабочий контур Навигатора.', './dashboard-v2.html', 'work'),
    card('Список сделок', 'Проверка видимости сделок по текущей роли.', './deals-v2.html', 'deals')
  ].join('');
}
function draw() {
  const profileLine = profile
    ? `${esc(profile.email || 'без email')} · ${esc(roleName(profile.role))} · ${profile.is_active ? 'активен' : 'статус уточняется'}`
    : 'профиль не определен';
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero">
      <h1>Диагностика Навигатора</h1>
      <p>Единая точка входа для проверки системы, карточек, доступов и RPC grants. CRM «Лидер» не используется.</p>
    </section>
    ${errorText ? `<div class="status error">${esc(errorText)}</div>` : `<div class="status ${isAdmin() ? 'ok' : 'warn'}">Текущий профиль: ${profileLine}</div>`}
    <section class="grid">
      <div class="card">
        <div class="section-title"><div><h2>Общие проверки</h2><p class="muted">Доступны всем авторизованным ролям, результат зависит от прав пользователя.</p></div><span class="pill blue">all roles</span></div>
        <div class="list">${commonCards()}</div>
      </div>
      <div class="card">
        <div class="section-title"><div><h2>Owner/admin</h2><p class="muted">Проверки управления, качества данных, доступа к сделке и Supabase grants.</p></div><span class="pill yellow">restricted</span></div>
        <div class="list">${adminCards()}</div>
      </div>
    </section>
    <section class="card">
      <h2>Рекомендуемый порядок</h2>
      <div class="list">
        <div class="list-item"><b>1. Operations health overview</b><p class="muted">Для owner/admin: одним запуском увидеть технические блокеры и операционные предупреждения.</p></div>
        <div class="list-item"><b>2. Проверка системы</b><p class="muted">Базовая проверка входа, роли и ключевых RPC.</p></div>
        <div class="list-item"><b>3. Security hardening</b><p class="muted">Для owner/admin: убедиться, что RLS и прямые grants закрыты для anon/PUBLIC.</p></div>
        <div class="list-item"><b>4. Frontend RPC coverage</b><p class="muted">Для owner/admin: убедиться, что все RPC, вызываемые интерфейсом, существуют, доступны authenticated и входят в grant-health.</p></div>
        <div class="list-item"><b>5. Качество данных сделок</b><p class="muted">Для owner/admin: найти пробелы в карточках, срочные auto-quality задачи и сделки для исправления.</p></div>
        <div class="list-item"><b>6. Качество профилей команды</b><p class="muted">Для owner/admin: проверить СПН без менеджера, телефоны, email, дубли и корректность manager_id.</p></div>
        <div class="list-item"><b>7. RPC grants</b><p class="muted">Для owner/admin: убедиться, что authenticated/anon/PUBLIC выставлены корректно на публичных RPC.</p></div>
        <div class="list-item"><b>8. Диагностика доступа к сделке</b><p class="muted">Для проблем конкретного пользователя и конкретной сделки.</p></div>
        <div class="list-item"><b>9. Команда и качество данных</b><p class="muted">Проверка ролей, активных профилей, demo-набора и auto-quality задач.</p></div>
      </div>
    </section>
  </main>`;
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
}

init();
