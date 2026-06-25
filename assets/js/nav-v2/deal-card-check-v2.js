import { getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js?v=20260625-1230';

const app = document.getElementById('app');
const dealId = new URLSearchParams(location.search).get('id') || '';
const rows = [];

function add(name, value, ok = true) {
  rows.push({ name, value, ok });
  draw();
}

function draw() {
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>Проверка карточки</h1><p>${esc(dealId || 'id не указан')}</p></section>
    <section class="card"><div class="status ok">Если обычная карточка зависает или показывает таймаут, используйте «Безопасный вход». Он загружает сделку через отдельный модуль с обновлённым Supabase-клиентом.</div><div class="actions" style="justify-content:flex-start"><a class="btn primary" href="./deal-card-v2.html?id=${encodeURIComponent(dealId)}&cache=${Date.now()}">Открыть карточку</a><a class="btn light" href="./deal-card-safe-v2.html?id=${encodeURIComponent(dealId)}&cache=${Date.now()}">Безопасный вход</a><a class="btn light" href="./deals-v2.html">Сделки</a></div></section>
    <section class="card"><h2>Результат</h2><div class="list">${rows.map((r) => `<div class="list-item"><b>${esc(r.name)}</b><span class="pill ${r.ok ? 'green' : 'red'}">${r.ok ? 'ok' : 'ошибка'}</span><p>${esc(r.value)}</p></div>`).join('') || '<div class="status">Запускаю проверку...</div>'}</div></section>
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
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  draw();
  await check('Профиль', async () => {
    const d = await rpc('nav_v2_get_my_profile', {}, 15000);
    return `${d?.profile?.full_name || d?.profile?.email || 'профиль'} · ${d?.profile?.role || ''}`;
  });
  await check('Карточка', async () => {
    const d = await rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 60000);
    return `${d?.deal?.title || 'загружена'} · документов: ${(d?.documents || []).length} · задач: ${(d?.tasks || []).length}`;
  });
}

run();
