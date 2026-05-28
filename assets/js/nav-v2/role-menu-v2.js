import { clearCachedProfiles, getCachedProfile, getMyProfile, signOut } from './supabase-v2.js';

function makeLink(active, id, href, title) {
  return `<a class="${active === id ? 'active' : ''}" href="${href}">${title}</a>`;
}

function getActivePage() {
  const path = location.pathname;
  if (path.includes('dashboard-v2')) return 'dashboard';
  if (path.includes('spn-v2')) return 'spn';
  if (path.includes('deals-v2') || path.includes('deal-card-v2')) return 'deals';
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
    makeLink(active, 'check', './nav-system-check-v2.html', 'Проверка'),
    '<button id="navLogout" type="button">Выйти</button>'
  ].join('');
}

function buildMenu(role) {
  const active = getActivePage();
  const links = [];

  if (role === 'lawyer') {
    links.push(makeLink(active, 'dashboard', './dashboard-v2.html', 'Рабочий стол'));
    links.push(makeLink(active, 'deals', './deals-v2.html?filter=lawyer', 'Юридическая очередь'));
    links.push(makeLink(active, 'check', './nav-system-check-v2.html', 'Проверка'));
  } else if (role === 'broker') {
    links.push(makeLink(active, 'dashboard', './dashboard-v2.html', 'Рабочий стол'));
    links.push(makeLink(active, 'deals', './deals-v2.html?filter=broker', 'Брокерская очередь'));
    links.push(makeLink(active, 'check', './nav-system-check-v2.html', 'Проверка'));
  } else if (role === 'spn') {
    links.push(makeLink(active, 'dashboard', './dashboard-v2.html', 'Рабочий стол'));
    links.push(makeLink(active, 'spn', './spn-v2.html', 'Новая сделка'));
    links.push(makeLink(active, 'deals', './deals-v2.html', 'Мои сделки'));
    links.push(makeLink(active, 'check', './nav-system-check-v2.html', 'Проверка'));
  } else if (role === 'manager') {
    links.push(makeLink(active, 'dashboard', './dashboard-v2.html', 'Рабочий стол'));
    links.push(makeLink(active, 'deals', './deals-v2.html', 'Сделки команды'));
    links.push(makeLink(active, 'check', './nav-system-check-v2.html', 'Проверка'));
  } else if (role === 'viewer') {
    links.push(makeLink(active, 'dashboard', './dashboard-v2.html', 'Рабочий стол'));
    links.push(makeLink(active, 'deals', './deals-v2.html', 'Сделки'));
    links.push(makeLink(active, 'check', './nav-system-check-v2.html', 'Проверка'));
  } else if (role === 'owner' || role === 'admin') {
    links.push(makeLink(active, 'dashboard', './dashboard-v2.html', 'Рабочий стол'));
    links.push(makeLink(active, 'spn', './spn-v2.html', 'Новая сделка'));
    links.push(makeLink(active, 'deals', './deals-v2.html', 'Сделки'));
    links.push(makeLink(active, 'admin', './admin-v2.html', 'Команда'));
    links.push(makeLink(active, 'access', './nav-access-v2.html', 'Создать доступ'));
    links.push(makeLink(active, 'audit', './nav-access-audit-v2.html', 'Аудит'));
    links.push(makeLink(active, 'check', './nav-system-check-v2.html', 'Проверка'));
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

  const roleNames = { owner: 'владелец', admin: 'админ', manager: 'менеджер', spn: 'СПН', lawyer: 'юрист', broker: 'брокер', viewer: 'наблюдатель' };
  badge.textContent = `${profile.email || ''} · ${roleNames[profile.role] || profile.role || ''}`;
}

async function waitForMenu(timeout = 6000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const menu = document.querySelector('.nav-v2-menu');
      if (menu || Date.now() - started > timeout) {
        clearInterval(timer);
        resolve(menu);
      }
    }, 50);
  });
}

function renderProfileMenu(menu, profile) {
  if (!profile?.role) return false;
  menu.innerHTML = buildMenu(profile.role);
  setBadge(profile);
  bindLogout();
  document.body.dataset.navRole = profile.role;
  return true;
}

async function refreshRoleMenu(menu, attempt = 1) {
  try {
    const profile = await getMyProfile({ refresh: true, timeout: attempt < 3 ? 6000 : 12000 });
    if (!renderProfileMenu(menu, profile)) throw new Error('role not found');
  } catch (_) {
    if (attempt < 4) {
      setTimeout(() => refreshRoleMenu(menu, attempt + 1), attempt * 2500);
    }
  }
}

async function init() {
  const menu = await waitForMenu();
  if (!menu) return;

  const cachedProfile = getCachedProfile();
  if (!renderProfileMenu(menu, cachedProfile)) {
    menu.innerHTML = safeMenu();
    bindLogout();
  }

  refreshRoleMenu(menu, 1);
}

init();
