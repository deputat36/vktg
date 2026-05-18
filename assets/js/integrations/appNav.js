function loadStylesheet() {
  if (document.querySelector('link[href="./assets/css/app-nav.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './assets/css/app-nav.css';
  document.head.appendChild(link);
}

function currentPage() {
  const path = location.pathname.split('/').pop() || 'index.html';
  if (path === 'deals.html') return 'deals';
  if (path === 'admin.html') return 'admin';
  return 'index';
}

function pageTitle(id) {
  if (id === 'deals') return 'Сделки / CRM';
  if (id === 'admin') return 'Сотрудники / роли';
  return 'Навигатор сделки';
}

function ensureNav() {
  if (document.getElementById('appNav')) return;
  const wrap = document.querySelector('.wrap');
  const topbar = document.querySelector('.topbar');
  if (!wrap || !topbar) return;

  const page = currentPage();
  const nav = document.createElement('nav');
  nav.id = 'appNav';
  nav.className = 'app-nav';
  nav.innerHTML = `
    <a href="./index.html" class="${page === 'index' ? 'active' : ''}">🏠 Навигатор</a>
    <a href="./deals.html" class="${page === 'deals' ? 'active' : ''}">📋 Сделки</a>
    <a href="./admin.html" class="${page === 'admin' ? 'active' : ''}">⚙️ Сотрудники</a>
    <a href="./index.html#systemAudit" data-open-check>✅ Проверка</a>
    <span class="nav-spacer"></span>
    <span class="nav-status">${pageTitle(page)}</span>
  `;
  wrap.insertBefore(nav, topbar.nextSibling);

  nav.querySelector('[data-open-check]')?.addEventListener('click', (event) => {
    if (page !== 'index') return;
    event.preventDefault();
    document.querySelector('[data-tab="systemAudit"]')?.click();
    document.getElementById('systemAudit')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function start() {
  loadStylesheet();
  ensureNav();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
