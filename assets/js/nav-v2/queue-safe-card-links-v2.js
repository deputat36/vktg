import { getMyProfile, esc } from './supabase-v2.js';

const SAFE_LINK_ATTR = 'data-safe-card-link-v2';
const QUEUE_ROLES = new Set(['owner', 'admin', 'manager', 'lawyer']);
let queued = false;
let blockedProfile = null;

function dealIdFromHref(href) {
  try {
    const url = new URL(href, location.href);
    return url.searchParams.get('id') || '';
  } catch (_) {
    return '';
  }
}

function safeHref(id) {
  return `./deal-card-safe-v2.html?id=${encodeURIComponent(id)}&from=queue&cache=${Date.now()}`;
}

function ensureSafeLink(card, id) {
  if (!card || !id || card.querySelector(`[${SAFE_LINK_ATTR}]`)) return;
  const actions = card.querySelector('.actions');
  if (!actions) return;
  const link = document.createElement('a');
  link.className = 'btn light';
  link.href = safeHref(id);
  link.textContent = 'Безопасный вход';
  link.setAttribute(SAFE_LINK_ATTR, 'true');
  actions.appendChild(link);
}

function renderNoAccess(profile) {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `<main class="nav-v2-shell">
    <section class="hero">
      <h1>Кабинет юриста недоступен</h1>
      <p>Этот экран нужен юристу, руководителю или менеджеру.</p>
    </section>
    <section class="card">
      <div class="status warn">${esc(profile?.email || 'Пользователь')} · роль: ${esc(profile?.role || 'не определена')}</div>
      <p class="muted">Для вашей роли открыт рабочий стол и список ваших сделок.</p>
      <div class="actions" style="justify-content:flex-start">
        <a class="btn primary" href="./dashboard-v2.html">Рабочий стол</a>
        <a class="btn light" href="./deals-v2.html">Сделки</a>
      </div>
    </section>
  </main>`;
}

function apply() {
  if (blockedProfile) {
    renderNoAccess(blockedProfile);
    return;
  }
  document.querySelectorAll('article.deal-card a[href*="deal-card-v2.html"]').forEach((link) => {
    const id = dealIdFromHref(link.href);
    const card = link.closest('article.deal-card');
    ensureSafeLink(card, id);
  });
}

function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    apply();
  });
}

async function guardQueueRole() {
  try {
    const profile = await getMyProfile({ timeout: 8000 });
    if (profile?.role && !QUEUE_ROLES.has(profile.role)) {
      blockedProfile = profile;
      renderNoAccess(profile);
    }
  } catch (_) {
    // Основная страница сама покажет ошибку входа или доступа.
  }
}

new MutationObserver(schedule).observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
apply();
guardQueueRole();