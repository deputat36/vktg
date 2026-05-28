import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const SESSION_KEY = 'nav_session_v2';

function session() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
}

function fetchWithTimeout(url, options = {}, timeout = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function getProfile() {
  const s = session();
  if (!s?.access_token) return null;

  const response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/nav_v2_get_my_profile`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${s.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  }, 6000);

  if (!response.ok) return null;
  const data = await response.json();
  return data?.profile || null;
}

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
  logout.onclick = () => {
    localStorage.removeItem(SESSION_KEY);
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

async function init() {
  const menu = await waitForMenu();
  if (!menu) return;

  menu.innerHTML = safeMenu();
  bindLogout();

  try {
    const profile = await getProfile();
    if (!profile?.role) return;
    menu.innerHTML = buildMenu(profile.role);
    setBadge(profile);
    bindLogout();
    document.body.dataset.navRole = profile.role;
  } catch (_) {
    menu.innerHTML = safeMenu();
    bindLogout();
  }
}

init();
