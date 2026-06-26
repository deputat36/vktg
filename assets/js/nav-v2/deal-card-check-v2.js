import { getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js?v=20260625-1230';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const dealId = params.get('id') || '';
const rows = [];

function add(name, value, ok = true) {
  rows.push({ name, value, ok });
  draw();
}

function resultClass(row) {
  return row.ok ? 'green' : 'red';
}

function browserContextText(user) {
  const cache = params.get('cache') || 'не указан';
  const email = user?.email || user?.user?.email || 'email не найден';
  const id = user?.id || user?.user?.id || 'id не найден';
  return `Пользователь в браузере: ${email} · id: ${id} · cache=${cache} · ${location.pathname}`;
}

function draw() {
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Проверка карточки</h1><p>${esc(dealId || 'id не указан')}</p></section>
    <section class="card">
      <div class="status ok">Диагностика проверяет браузерный контекст, профиль, облегчённую карточку и полную карточку отдельно. Если полная карточка зависает, используйте безопасный вход.</div>
      <div class="actions" style="justify-content:flex-start">
        <a class="btn primary" href="./deal-card-v2.html?id=${encodeURIComponent(dealId)}&cache=${Date.now()}">Открыть карточку</a>
        <a class="btn light" href="./deal-card-safe-v2.html?id=${encodeURIComponent(dealId)}&cache=${Date.now()}">Безопасный вход</a>
        <a class="btn light" href="./nav-v2.html?clean=1">Чистый вход</a>
        <a class="btn light" href="./deals-v2.html">Сделки</a>
      </div>
    </section>
    <section class="card"><h2>Результат</h2><div class="list">${rows.map((r) => `<div class="list-item"><b>${esc(r.name)}</b><span class="pill ${resultClass(r)}">${r.ok ? 'ok' : 'ошибка'}</span><p>${esc(r.value)}</p></div>`).join('') || '<div class="status">Запускаю проверку...</div>'}</div></section>
  </main>`;
}

async function check(name, fn) {
  const start = performance.now();
  try {
    const value = await fn();
    add(name, `${Math.round(performance.now() - start)} мс · ${value}`, true);
  } catch (error) {
    add(name, `${Math.round(performance.now() - start)} мс · ${error.message || error}`, false);
  }
}

async function run() {
  const cachedUser = getCachedUser();
  if (!cachedUser) return renderAuthBox(app, async () => location.reload());
  draw();
  add('Браузер', browserContextText(cachedUser), true);
  await check('Профиль', async () => {
    const d = await rpc('nav_v2_get_my_profile', {}, 15000);
    return `${d?.profile?.full_name || d?.profile?.email || 'профиль'} · ${d?.profile?.role || ''}`;
  });
  await check('Lite-карточка', async () => {
    const d = await rpc('nav_v2_get_deal_card_lite', { p_deal_id: dealId }, 30000);
    return `${d?.deal?.title || 'загружена'} · lite=${d?.lite === true} · документов: ${(d?.documents || []).length} · задач: ${(d?.tasks || []).length}`;
  });
  await check('Полная карточка', async () => {
    const d = await rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 60000);
    return `${d?.deal?.title || 'загружена'} · документов: ${(d?.documents || []).length} · задач: ${(d?.tasks || []).length} · событий: ${(d?.events || []).length}`;
  });
}

run();
