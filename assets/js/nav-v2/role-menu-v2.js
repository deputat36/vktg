import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const SESSION_KEY = 'nav_session_v2';

function session() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) { return null; }
}

function textOf(el) {
  return String(el?.textContent || '').trim().toLowerCase();
}

function waitForMenu(timeout = 5000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const menu = document.querySelector('.nav-v2-menu');
      if (menu || Date.now() - started > timeout) {
        clearInterval(timer);
        resolve(menu);
      }
    }, 100);
  });
}

async function getProfile() {
  const s = session();
  if (!s?.access_token) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/nav_v2_get_my_profile`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${s.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data?.profile || null;
}

function removeLinks(menu, labels) {
  [...menu.querySelectorAll('a,button')].forEach((el) => {
    const label = textOf(el);
    if (labels.some((item) => label.includes(item))) el.remove();
  });
}

function addLink(menu, href, label, beforeLogout = true) {
  const exists = [...menu.querySelectorAll('a')].some((a) => a.getAttribute('href') === href || textOf(a) === label.toLowerCase());
  if (exists) return;
  const a = document.createElement('a');
  a.href = href;
  a.textContent = label;
  const logout = menu.querySelector('#navLogout');
  if (beforeLogout && logout) menu.insertBefore(a, logout);
  else menu.appendChild(a);
}

function normalizeMenu(menu, role) {
  if (!menu || !role) return;

  addLink(menu, './nav-system-check-v2.html', 'Проверка');

  if (role === 'spn') {
    removeLinks(menu, ['команда', 'приглашение', 'создать доступ', 'ссылка доступа', 'аудит', 'старая версия']);
    return;
  }

  if (role === 'lawyer' || role === 'broker' || role === 'viewer') {
    removeLinks(menu, ['новая сделка', 'команда', 'приглашение', 'создать доступ', 'ссылка доступа', 'аудит', 'старая версия']);
    return;
  }

  if (role === 'manager') {
    removeLinks(menu, ['приглашение', 'создать доступ', 'ссылка доступа', 'старая версия']);
    return;
  }

  if (role === 'owner' || role === 'admin') {
    removeLinks(menu, ['приглашение']);
    addLink(menu, './nav-access-v2.html', 'Создать доступ');
    addLink(menu, './nav-access-audit-v2.html', 'Аудит');
  }
}

async function init() {
  const menu = await waitForMenu();
  if (!menu) return;
  const profile = await getProfile();
  normalizeMenu(menu, profile?.role);
  const badge = document.getElementById('navUserBadge');
  if (badge && profile?.email) badge.textContent = `${profile.email} · ${profile.role}`;
}

init();
