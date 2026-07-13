import { clearCachedProfiles, getCachedProfile, getCachedUser, getMyProfile, signOut } from './supabase-v2.js';

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_WAIT_TIMEOUT_MS = 15000;
const OWNER_WORK_PAGES = new Set(['dashboard', 'spn', 'deals', 'manager', 'queue']);
const OWNER_TEAM_PAGES = new Set(['admin', 'access', 'audit']);
const OWNER_SYSTEM_PAGES = new Set(['check', 'diagnostics']);

function makeLink(active, id, href, title) {
  const current = active === id;
  return `<a class="${current ? 'active' : ''}" href="${href}"${current ? ' aria-current="page"' : ''}>${title}</a>`;
}

function makeGroup(title, links, isActive = false, isOpen = false) {
  return `<details class="nav-v2-menu-group"${isOpen ? ' open' : ''} data-active="${isActive ? 'true' : 'false'}"><summary${isActive ? ' aria-current="page"' : ''}>${title}</summary><div class="nav-v2-menu-group-links">${links.join('')}</div></details>`;
}

function ensureMenuGroupStyles() {
  if (document.getElementById('navV2MenuGroupStyles')) return;
  const style = document.createElement('style');
  style.id = 'navV2MenuGroupStyles';
  style.textContent = `
    .nav-v2-menu-group{position:relative}
    .nav-v2-menu-group>summary{list-style:none;border:0;border-radius:14px;background:#e8eef8;color:#1d3557;padding:10px 13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:7px;user-select:none}
    .nav-v2-menu-group>summary::-webkit-details-marker{display:none}
    .nav-v2-menu-group>summary::after{content:'▾';font-size:11px;transition:transform .15s ease}
    .nav-v2-menu-group[open]>summary::after{transform:rotate(180deg)}
    .nav-v2-menu-group[data-active="true"]>summary{background:#1d4ed8;color:#fff}
    .nav-v2-menu-group-links{position:absolute;z-index:40;top:calc(100% + 8px);right:0;min-width:230px;padding:8px;display:grid;gap:6px;background:#fff;border:1px solid #dbe4f0;border-radius:16px;box-shadow:0 18px 48px rgba(15,23,42,.16)}
    .nav-v2-menu-group-links a{width:100%;justify-content:flex-start;text-align:left}
    @media(max-width:860px){
      .nav-v2-menu-group{width:100%}
      .nav-v2-menu-group>summary{width:100%;min-height:36px;padding:7px 6px;border-radius:12px;font-size:12px;line-height:1.1;justify-content:center;text-align:center}
      .nav-v2-menu-group-links{position:static;min-width:0;margin-top:6px;padding:6px;border-radius:12px;box-shadow:none;background:#f8fafc}
      .nav-v2-menu-group-links a{justify-content:center;text-align:center}
    }
  `;
  document.head.appendChild(style);
}

function getActivePage() {
  const path = location.pathname;
  if (path.includes('dashboard-v2')) return 'dashboard';
  if (path.includes('manager-v2') || path.includes('task-review-v2')) return 'manager';
  if (path.includes('broker-v2')) return 'broker';
  if (path.includes('viewer-v2')) return 'viewer';
  if (path.includes('spn-v2')) return 'spn';
  if (path.includes('queue-v2')) return 'queue';
  if (path.includes('deals-v2') || path.includes('deal-card-v2')) return 'deals';
  if (
    path.includes('diagnostics-v2') ||
    path.includes('operations-health-check-v2') ||
    path.includes('security-hardening-check-v2') ||
    path.includes('frontend-rpc-coverage-check-v2') ||
    path.includes('data-quality-check-v2') ||
    path.includes('team-profile-quality-check-v2') ||
    path.includes('rpc-grant-check-v2') ||
    path.includes('deal-access-check-v2') ||
    path.includes('deal-card-check-v2') ||
    path.includes('deal-card-diag-v2')
  ) return 'diagnostics';
  if (path.includes('admin-v2') || path.includes('admin-invite-v2')) return 'admin';
  if (path.includes('nav-access-audit-v2')) return 'audit';
  if (path.includes('nav-access-v2')) return 'access';
  if (path.includes('nav-system-check-v2')) return 'check';
  return '';
}

function safeMenu() {
  const active = getActivePage();
  return [
    makeLink(active, 'dashboard', './dashboard-v2.html', 'Рабочий стол'),
    makeLink(active, 'deals', './deals-v2.html', 'Сделки'),
    '<button id="navLogout" type="button">Выйти</button>'
  ].join('');
}

function addAdminDiagnosticsLinks(links, active) {
  links.push(makeLink(active, 'check', './nav-system-check-v2.html', 'Проверка системы'));
  links.push(makeLink(active, 'diagnostics', './diagnostics-v2.html', 'Диагностика'));
}

function buildMenu(role) {
  const active = getActivePage();
  const links = [];

  if (role === 'lawyer') {
    links.push(makeLink(active, 'dashboard', './dashboard-v2.html', 'Рабочий стол'));
    links.push(makeLink(active, 'queue', './queue-v2.html', 'Кабинет юриста'));
    links.push(makeLink(active, 'deals', './deals-v2.html?filter=lawyer', 'Все сделки'));
  } else if (role === 'broker') {
    links.push(makeLink(active, 'dashboard', './dashboard-v2.html', 'Рабочий стол'));
    links.push(makeLink(active, 'broker', './broker-v2.html', 'Брокерская очередь'));
    links.push(makeLink(active, 'deals', './deals-v2.html?filter=broker', 'Все финансовые сделки'));
  } else if (role === 'spn') {
    links.push(makeLink(active, 'dashboard', './dashboard-v2.html', 'Рабочий стол'));
    links.push(makeLink(active, 'spn', './spn-v2.html', 'Новая сделка'));
    links.push(makeLink(active, 'deals', './deals-v2.html', 'Мои сделки'));
  } else if (role === 'manager') {
    links.push(makeLink(active, 'dashboard', './dashboard-v2.html', 'Рабочий стол'));
    links.push(makeLink(active, 'manager', './manager-v2.html', 'Контроль сделок'));
    links.push(makeLink(active, 'deals', './deals-v2.html', 'Сделки команды'));
  } else if (role === 'viewer') {
    links.push(makeLink(active, 'viewer', './viewer-v2.html', 'Обзор'));
    links.push(makeLink(active, 'deals', './deals-v2.html', 'Сделки'));
  } else if (role === 'owner' || role === 'admin') {
    const workLinks = [
      makeLink(active, 'dashboard', './dashboard-v2.html', 'Рабочий стол'),
      makeLink(active, 'spn', './spn-v2.html', 'Новая сделка'),
      makeLink(active, 'deals', './deals-v2.html', 'Сделки'),
      makeLink(active, 'manager', './manager-v2.html', 'Контроль сделок'),
      makeLink(active, 'queue', './queue-v2.html', 'Кабинет юриста')
    ];
    const teamLinks = [
      makeLink(active, 'admin', './admin-v2.html', 'Команда'),
      makeLink(active, 'access', './nav-access-v2.html', 'Доступы'),
      makeLink(active, 'audit', './nav-access-audit-v2.html', 'Аудит доступов')
    ];
    const systemLinks = [];
    addAdminDiagnosticsLinks(systemLinks, active);
    links.push(makeGroup('Работа', workLinks, OWNER_WORK_PAGES.has(active)));
    links.push(makeGroup('Команда и доступы', teamLinks, OWNER_TEAM_PAGES.has(active)));
    links.push(makeGroup('Система', systemLinks, OWNER_SYSTEM_PAGES.has(active)));
  } else {
    return safeMenu();
  }

  links.push('<button id="navLogout" type="button">Выйти</button>');
  return links.join('');
}

function bindLogout() {
  const logout = document.getElementById('navLogout');
  if (!logout) return;
  logout.onclick = async () => {
    clearCachedProfiles();
    await signOut();
    location.href = './nav-v2.html';
  };
}

function setBadge(profile) {
  const badge = document.getElementById('navUserBadge');
  if (!badge || !profile) return;
  const roleNames = { owner: 'владелец', admin: 'администратор', manager: 'менеджер', spn: 'СПН', lawyer: 'юрист', broker: 'брокер', viewer: 'наблюдатель' };
  badge.textContent = `${profile.email || ''} · ${roleNames[profile.role] || profile.role || ''}`;
}

function profileIsFresh(profile) {
  return Boolean(
    profile?.role &&
    Number(profile.cached_at) > 0 &&
    Date.now() - Number(profile.cached_at) < PROFILE_CACHE_TTL_MS
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMenu(timeout = 2000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const menu = document.querySelector('.nav-v2-menu');
    if (menu) return menu;
    await sleep(50);
  }
  return document.querySelector('.nav-v2-menu');
}

async function waitForUser(timeout = USER_WAIT_TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const user = getCachedUser();
    if (user?.id) return user;
    await sleep(100);
  }
  return null;
}

function renderProfileMenu(menu, profile) {
  if (!profile?.role) return false;
  ensureMenuGroupStyles();
  menu.innerHTML = buildMenu(profile.role);
  setBadge(profile);
  bindLogout();
  document.body.dataset.navRole = profile.role;
  return true;
}

async function refreshRoleMenu(menu) {
  if (!getCachedUser()?.id) return;
  try {
    const profile = await getMyProfile({ refresh: true, timeout: 5000 });
    renderProfileMenu(menu, profile);
  } catch (_) {
    // Без циклических повторов: основной экран продолжает работать с кешем.
  }
}

async function init() {
  const menu = await waitForMenu();
  if (!menu) return;

  let cachedProfile = getCachedProfile();
  if (!renderProfileMenu(menu, cachedProfile)) {
    menu.innerHTML = safeMenu();
    bindLogout();
  }

  let user = getCachedUser();
  if (!user?.id) user = await waitForUser();
  if (!user?.id) return;

  await sleep(100);
  cachedProfile = getCachedProfile();

  if (renderProfileMenu(menu, cachedProfile) && profileIsFresh(cachedProfile)) return;
  await refreshRoleMenu(menu);
}

init();
