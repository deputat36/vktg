import { renderAuthBox } from './supabase-v2.js';

function clearNavigatorSession() {
  try { localStorage.removeItem('nav_session_v2'); } catch (_) {}
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('nav_profile_v2:'))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch (_) {}
}

function looksLikeExpiredSession(text) {
  const value = String(text || '').toLowerCase();
  return value.includes('ошибка supabase 400')
    || value.includes('ошибка supabase 401')
    || value.includes('refresh_token')
    || value.includes('refresh token')
    || value.includes('jwt expired')
    || value.includes('unauthorized')
    || value.includes('сессия истекла');
}

function replaceWithLogin() {
  const app = document.getElementById('app');
  if (!app) return;
  clearNavigatorSession();
  renderAuthBox(app, async () => location.reload());
  const status = document.getElementById('authStatus');
  if (status) {
    status.className = 'status warn';
    status.textContent = 'Сессия истекла или была повреждена. Войдите снова.';
  }
}

function checkExpiredSession() {
  const app = document.getElementById('app');
  if (!app) return;
  if (looksLikeExpiredSession(app.textContent)) replaceWithLogin();
}

setTimeout(checkExpiredSession, 300);
setTimeout(checkExpiredSession, 1200);
