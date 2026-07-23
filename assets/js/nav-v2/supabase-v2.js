import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';
import { minimizeNavigatorReadPayload } from './read-layer-minimization-model-v2.js?v=20260716-01';
import { createAuthStorageController } from './auth-storage-guard-v2.js?v=20260723-01';
import {
  NAV_AUTH_REFRESH_LOCK_NAME,
  createAuthSessionExpiredError,
  hasSessionAdvancedSinceRequest,
  isAuthSessionExpiredError,
  isReplacementAuthSession,
  isSameAuthSession,
  shouldInvalidateSessionAfterRefreshFailure
} from './auth-session-recovery-v2.js?v=20260721-02';

export const NAV_V2_BUILD_ID = '20260723-01';
if (typeof document !== 'undefined') {
  document.documentElement.dataset.navV2Build = NAV_V2_BUILD_ID;
}

const SESSION_KEY = 'nav_session_v2';
const PROFILE_CACHE_KEY = 'nav_profile_v2';
const PROFILE_CACHE_PREFIX = `${PROFILE_CACHE_KEY}:`;
const LAST_EMAIL_KEY = 'nav_last_email_v2';
const WIZARD_RECOVERY_TTL_MS = 2 * 60 * 1000;
const DEFAULT_RPC_TIMEOUT_MS = 45000;
const DEDUPED_RPC_NAMES = new Set([
  'nav_v2_get_deal_card',
  'nav_v2_get_my_profile',
  'nav_v2_get_deal_responsibility_snapshot',
  'nav_v2_get_deal_status_options',
  'nav_v2_get_handoff_scores'
]);
let profileRequest = null;
let refreshRequest = null;
let lastDealsListIds = new Set();
let wizardSaveRecovery = null;
let inFlightRpc = new Map();

function browserStorage(name) {
  try { return globalThis[name] || null; } catch (_) { return null; }
}

const authStorage = createAuthStorageController({
  local: browserStorage('localStorage'),
  session: browserStorage('sessionStorage'),
  sessionKey: SESSION_KEY,
  profilePrefix: PROFILE_CACHE_PREFIX,
  lastEmailKey: LAST_EMAIL_KEY
});

function readSession() {
  return authStorage.readSession();
}

function clearProfileCache() {
  return authStorage.clearProfiles();
}

function writeSession(session) {
  return session ? authStorage.persistSession(session) : authStorage.clearSession();
}

function rememberEmail(email) {
  return authStorage.rememberEmail(email);
}

function decodeJwt(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(base64), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
  } catch (_) { return null; }
}

function sessionEmail(session) {
  return session?.user?.email || decodeJwt(session?.access_token)?.email || '';
}

function invalidateStoredSession(session) {
  return authStorage.clearSession({ email: sessionEmail(session) });
}

export function getCachedUser() {
  const session = readSession();
  if (!session?.access_token) return null;
  const payload = decodeJwt(session.access_token);
  const user = session.user || {};
  return { id: user.id || payload?.sub, email: user.email || payload?.email };
}

function profileCacheKey() {
  const user = getCachedUser();
  return `${PROFILE_CACHE_PREFIX}${user?.id || user?.email || 'anonymous'}`;
}

export function getCachedProfile() {
  return authStorage.readProfile(profileCacheKey());
}

export function saveCachedProfile(profile) {
  return authStorage.saveProfile(profileCacheKey(), profile);
}

export function clearCachedProfiles() {
  return clearProfileCache();
}

function headers(session = readSession()) {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: 'Bearer ' + (session?.access_token || SUPABASE_PUBLISHABLE_KEY),
    'Content-Type': 'application/json'
  };
}

function authErrorText(error) {
  if (isAuthSessionExpiredError(error)) return error.message;
  const message = String(error?.message || error || '').trim();
  const normalized = message.toLowerCase();
  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid_credentials') ||
    normalized.includes('invalid grant') ||
    normalized.includes('invalid_grant') ||
    normalized.includes('ошибка supabase 400') ||
    normalized.includes('supabase 400') ||
    normalized.includes('запрос не выполнен')
  ) {
    return 'Неверный email или пароль. Проверьте пароль вручную, не используйте автоподстановку. Если не уверены — нажмите «Восстановить пароль» и задайте новый.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Email ещё не подтверждён. Откройте ссылку приглашения или восстановления пароля.';
  }
  return message || 'Не удалось войти. Проверьте email и пароль.';
}

async function safeFetch(url, options = {}, timeout = DEFAULT_RPC_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (error) {
    if (error.name === 'AbortError') throw new Error(`Supabase не ответил за ${Math.round(timeout / 1000)} сек. Проверьте соединение и повторите действие. Если это было сохранение сделки, проверьте список перед повторным нажатием.`);
    throw new Error('Не удалось подключиться к Supabase: ' + error.message);
  } finally { clearTimeout(timer); }
}

async function parse(response) {
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = text; }
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.msg || payload?.hint || payload?.error_description || payload?.error || `Ошибка Supabase ${response.status}: ${response.statusText || 'запрос не выполнен'}`);
    error.status = response.status;
    error.code = payload?.error_code || payload?.code || payload?.error || null;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function accessPageUrl() {
  return new URL('./nav-accept-invite-v2.html', window.location.href).href;
}

async function withAuthRefreshLock(callback) {
  const lockManager = globalThis.navigator?.locks;
  if (lockManager && typeof lockManager.request === 'function') {
    return lockManager.request(NAV_AUTH_REFRESH_LOCK_NAME, { mode: 'exclusive' }, callback);
  }
  return callback();
}

async function refreshSession(failedAccessToken = '') {
  if (refreshRequest) {
    console.info('[nav-v2] Auth refresh: использую уже выполняющееся обновление сессии');
    return refreshRequest;
  }
  refreshRequest = withAuthRefreshLock(async () => {
    const session = readSession();
    if (hasSessionAdvancedSinceRequest(session, failedAccessToken)) {
      console.info('[nav-v2] Auth refresh: другая вкладка уже обновила сессию');
      return session;
    }
    if (!session?.refresh_token) {
      invalidateStoredSession(session);
      throw createAuthSessionExpiredError();
    }
    try {
      const response = await safeFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      }, 12000);
      const payload = await parse(response);
      const currentSession = readSession();
      if (isReplacementAuthSession(currentSession, session)) {
        console.info('[nav-v2] Auth refresh: сохраняю более новую сессию из другой вкладки');
        return currentSession;
      }
      if (!isSameAuthSession(currentSession, session)) {
        rememberEmail(sessionEmail(session));
        throw createAuthSessionExpiredError();
      }
      writeSession(payload);
      return payload;
    } catch (error) {
      if (isAuthSessionExpiredError(error)) throw error;
      if (shouldInvalidateSessionAfterRefreshFailure(error)) {
        const currentSession = readSession();
        if (isReplacementAuthSession(currentSession, session)) {
          console.info('[nav-v2] Auth refresh: отклонён старый token, но другая вкладка уже сохранила новую сессию');
          return currentSession;
        }
        if (isSameAuthSession(currentSession, session)) invalidateStoredSession(session);
        else rememberEmail(sessionEmail(session));
        throw createAuthSessionExpiredError(error);
      }
      throw error;
    }
  }).finally(() => { refreshRequest = null; });
  return refreshRequest;
}

export async function signIn(email, password) {
  writeSession(null);
  const response = await safeFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const session = await parse(response);
  writeSession(session);
  rememberEmail(email);
  return session.user;
}

export async function requestPasswordReset(email) {
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) throw new Error('Введите email, для которого нужно восстановить пароль.');
  const response = await safeFetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(accessPageUrl())}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail })
  }, 12000);
  await parse(response);
  rememberEmail(cleanEmail);
  return true;
}

export async function signOut() {
  const session = readSession();
  try {
    if (session?.access_token) await safeFetch(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: headers(session) }, 10000);
  } finally { writeSession(null); }
}

export function requireUser() {
  const user = getCachedUser();
  if (!user?.id) throw new Error('Сначала войдите в систему');
  return user;
}

function rememberDealsList(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  lastDealsListIds = new Set(items.map((item) => item?.id).filter(Boolean));
}

function beginWizardSaveRecovery() {
  wizardSaveRecovery = {
    baselineIds: new Set(lastDealsListIds),
    hasBaseline: lastDealsListIds.size > 0,
    startedAt: Date.now(),
    active: false
  };
}

function activateWizardSaveRecovery() {
  if (!wizardSaveRecovery) beginWizardSaveRecovery();
  wizardSaveRecovery.active = true;
  wizardSaveRecovery.startedAt = Date.now();
}

function recoverNewDealsOnly(data) {
  const recovery = wizardSaveRecovery;
  if (!recovery?.active) {
    rememberDealsList(data);
    return data;
  }
  if (Date.now() - recovery.startedAt > WIZARD_RECOVERY_TTL_MS) {
    wizardSaveRecovery = null;
    rememberDealsList(data);
    return data;
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const newItems = recovery.hasBaseline
    ? items.filter((item) => item?.id && !recovery.baselineIds.has(item.id))
    : [];

  if (newItems.length) {
    wizardSaveRecovery = null;
    rememberDealsList(data);
  }
  return { ...data, items: newItems };
}

function rpcDedupeKey(name, payload, timeout) {
  try { return `${name}:${timeout}:${JSON.stringify(payload || {})}`; }
  catch (_) { return `${name}:${timeout}:payload`; }
}

async function executeRpc(name, payload = {}, timeout = DEFAULT_RPC_TIMEOUT_MS) {
  requireUser();
  const started = performance.now();
  let refreshed = false;
  if (name === 'nav_v2_save_wizard_result') beginWizardSaveRecovery();
  try {
    const requestSession = readSession();
    let response = await safeFetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: headers(requestSession), body: JSON.stringify(payload)
    }, timeout);
    if (response.status === 401 || response.status === 403) {
      refreshed = true;
      await refreshSession(requestSession?.access_token || '');
      response = await safeFetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: 'POST', headers: headers(), body: JSON.stringify(payload)
      }, timeout);
    }
    let data = minimizeNavigatorReadPayload(await parse(response));
    if (name === 'nav_v2_get_my_profile') saveCachedProfile(data?.profile || null);
    if (name === 'nav_v2_get_deals_list') data = recoverNewDealsOnly(data);
    if (name === 'nav_v2_save_wizard_result') wizardSaveRecovery = null;
    return data;
  } catch (error) {
    if (name === 'nav_v2_save_wizard_result') activateWizardSaveRecovery();
    throw error;
  } finally {
    console.info(`[nav-v2] RPC ${name}: ${Math.round(performance.now() - started)} ms${refreshed ? ' (после refresh)' : ''}`);
  }
}

export async function rpc(name, payload = {}, timeout = DEFAULT_RPC_TIMEOUT_MS) {
  if (!DEDUPED_RPC_NAMES.has(name)) return executeRpc(name, payload, timeout);
  const key = rpcDedupeKey(name, payload, timeout);
  const current = inFlightRpc.get(key);
  if (current) {
    console.info(`[nav-v2] RPC ${name}: использую уже выполняющийся запрос`);
    return current;
  }
  const promise = executeRpc(name, payload, timeout).finally(() => {
    if (inFlightRpc.get(key) === promise) inFlightRpc.delete(key);
  });
  inFlightRpc.set(key, promise);
  return promise;
}

export async function getMyProfile({ refresh = false, timeout = 6000 } = {}) {
  if (!refresh) {
    const cached = getCachedProfile();
    if (cached?.role) return cached;
  }
  if (profileRequest) return profileRequest;
  profileRequest = rpc('nav_v2_get_my_profile', {}, timeout)
    .then((data) => data?.profile || null)
    .finally(() => { profileRequest = null; });
  return profileRequest;
}

export function navTop() {
  return `<header class="nav-v2-top"><div class="nav-v2-top-inner"><div class="nav-v2-brand"><b>CRM Навигатор сделок v2</b><span id="navUserBadge">Загрузка...</span></div><nav class="nav-v2-menu"><a href="./dashboard-v2.html">Рабочий стол</a><a href="./deals-v2.html">Сделки</a><a href="./nav-system-check-v2.html">Проверка</a><button id="navLogout" type="button">Выйти</button></nav></div></header>`;
}

export function setupTop(active) {
  document.body.insertAdjacentHTML('afterbegin', navTop(active));
  const user = getCachedUser();
  const badge = document.getElementById('navUserBadge');
  if (badge) badge.textContent = user?.email ? `Вход: ${user.email}` : 'Не авторизован';
  const out = document.getElementById('navLogout');
  if (out) out.onclick = async () => { await signOut(); location.href = './nav-v2.html'; };
}

export function renderAuthBox(target, onLogin) {
  const lastEmail = esc(authStorage.readLastEmail());
  target.innerHTML = `<section class="card auth-card"><h2>Вход в Навигатор сделок</h2><p class="muted">Используется общий Supabase Auth, но роли проекта хранятся отдельно в nav_user_profiles.</p><div class="field"><label>Email</label><input id="navEmail" type="email" autocomplete="email" value="${lastEmail}"></div><div class="field"><label>Пароль</label><input id="navPassword" type="password" autocomplete="current-password"></div><div id="authStatus" class="status">Введите логин и пароль.</div><button id="navLogin" class="btn primary" type="button">Войти</button><button id="navForgot" class="btn light" type="button" style="margin-left:8px">Восстановить пароль</button></section>`;
  document.getElementById('navLogin').onclick = async () => {
    const status = document.getElementById('authStatus');
    try {
      status.className = 'status'; status.textContent = 'Выполняю вход...';
      await signIn(document.getElementById('navEmail').value.trim(), document.getElementById('navPassword').value);
      status.className = 'status ok'; status.textContent = 'Вход выполнен.';
      await onLogin();
    } catch (error) {
      const friendly = authErrorText(error);
      status.className = 'status error'; status.textContent = friendly.startsWith('Неверный') ? friendly : 'Ошибка входа: ' + friendly;
    }
  };
  document.getElementById('navForgot').onclick = async () => {
    const status = document.getElementById('authStatus');
    const email = document.getElementById('navEmail').value.trim();
    try {
      status.className = 'status'; status.textContent = 'Отправляю ссылку для восстановления...';
      await requestPasswordReset(email);
      status.className = 'status ok';
      status.textContent = 'Если этот email есть в системе, на него отправлена ссылка для установки нового пароля.';
    } catch (error) {
      status.className = 'status error';
      status.textContent = 'Не удалось отправить ссылку: ' + authErrorText(error);
    }
  };
}

export function esc(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
export function money(value) { if (value === null || value === undefined || value === '') return '—'; return Number(value).toLocaleString('ru-RU') + ' ₽'; }
export function riskPill(level) { const map = { green:['green','Обычная'], yellow:['yellow','Внимание'], red:['red','Стоп-фактор'] }; const [cls, text] = map[level] || ['blue', level || '—']; return `<span class="pill ${cls}">${text}</span>`; }
export function statusText(status) { return ({draft:'Черновик',need_info:'Нужно дозаполнить',need_lawyer:'Юрист',need_broker:'Брокер',need_documents:'Нужны документы',ready_for_deposit:'Готова к задатку',deposit_done:'Задаток внесен',preparing_deal:'Подготовка к сделке',ready_for_deal:'Готова к сделке',registration:'На регистрации',registered:'Зарегистрирована',closed:'Закрыта',cancelled:'Отменена'})[status] || status || '—'; }
