import assert from 'node:assert/strict';

import { NAV_AUTH_REFRESH_LOCK_NAME } from '../../assets/js/nav-v2/auth-session-recovery-v2.js';

class MemoryStorage {
  constructor() {
    Object.defineProperty(this, '_values', {
      value: new Map(),
      enumerable: false
    });
  }

  get length() {
    return this._values.size;
  }

  getItem(key) {
    return this._values.has(String(key)) ? this._values.get(String(key)) : null;
  }

  setItem(key, value) {
    const normalizedKey = String(key);
    const normalizedValue = String(value);
    this._values.set(normalizedKey, normalizedValue);
    Object.defineProperty(this, normalizedKey, {
      value: normalizedValue,
      writable: true,
      configurable: true,
      enumerable: true
    });
  }

  removeItem(key) {
    const normalizedKey = String(key);
    this._values.delete(normalizedKey);
    delete this[normalizedKey];
  }

  clear() {
    for (const key of this._values.keys()) delete this[key];
    this._values.clear();
  }

  key(index) {
    return [...this._values.keys()][index] ?? null;
  }
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function saveSession(session) {
  globalThis.localStorage.setItem('nav_session_v2', JSON.stringify(session));
}

function readSession() {
  const value = globalThis.localStorage.getItem('nav_session_v2');
  return value ? JSON.parse(value) : null;
}

function clearBrowserState() {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
}

function bearer(options) {
  return String(options?.headers?.Authorization || '');
}

let lockMode = 'success';
const lockCalls = [];
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    locks: {
      request: async (name, options, callback) => {
        lockCalls.push({ name, options, mode: lockMode });
        if (lockMode === 'reject') throw new Error('synthetic Web Locks acquisition failure');
        return callback({ name });
      }
    }
  }
});

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const supabase = await import(`../../assets/js/nav-v2/supabase-v2.js?lock-timeout-post-refresh=${Date.now()}`);

// A rejected Web Locks request must fail closed without calling the token
// endpoint, invalidating the session, or clearing profile cache. The rejected
// module-level refresh promise must be released so a later request can recover.
{
  clearBrowserState();
  const oldSession = {
    access_token: 'lock-old-access',
    refresh_token: 'lock-old-refresh',
    user: { id: 'lock-user', email: 'lock-user@example.test' }
  };
  saveSession(oldSession);
  globalThis.sessionStorage.setItem('nav_profile_v2:lock-user', JSON.stringify({ role: 'manager' }));

  lockMode = 'reject';
  const lockBaseline = lockCalls.length;
  let failedInitialRpcCalls = 0;
  let failedRefreshCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      failedRefreshCalls += 1;
      throw new Error('token endpoint must not run when Web Locks acquisition fails');
    }
    if (normalized.includes('/rest/v1/rpc/') && bearer(options) === 'Bearer lock-old-access') {
      failedInitialRpcCalls += 1;
      return jsonResponse(401, { message: 'JWT expired' });
    }
    throw new Error(`Unexpected request during lock failure: ${normalized}`);
  };

  await assert.rejects(
    () => supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    /synthetic Web Locks acquisition failure/
  );

  assert.equal(failedInitialRpcCalls, 1);
  assert.equal(failedRefreshCalls, 0, 'lock acquisition failure must stop before the token endpoint');
  assert.equal(lockCalls.length, lockBaseline + 1);
  assert.equal(lockCalls.at(-1)?.name, NAV_AUTH_REFRESH_LOCK_NAME);
  assert.equal(lockCalls.at(-1)?.options?.mode, 'exclusive');
  assert.deepEqual(readSession(), oldSession, 'lock acquisition failure must preserve the stored session');
  assert.deepEqual(
    JSON.parse(globalThis.sessionStorage.getItem('nav_profile_v2:lock-user')),
    { role: 'manager' },
    'lock acquisition failure must preserve profile cache'
  );

  lockMode = 'success';
  let recoveredInitialRpcCalls = 0;
  let recoveredRefreshCalls = 0;
  let recoveredRetryCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      recoveredRefreshCalls += 1;
      return jsonResponse(200, {
        access_token: 'lock-new-access',
        refresh_token: 'lock-new-refresh',
        user: { id: 'lock-user', email: 'lock-user@example.test' }
      });
    }
    if (normalized.includes('/rest/v1/rpc/')) {
      if (bearer(options) === 'Bearer lock-old-access') {
        recoveredInitialRpcCalls += 1;
        return jsonResponse(401, { message: 'JWT expired' });
      }
      if (bearer(options) === 'Bearer lock-new-access') {
        recoveredRetryCalls += 1;
        return jsonResponse(200, { ok: true, source: 'recovered-after-lock-failure' });
      }
    }
    throw new Error(`Unexpected request during lock recovery: ${normalized}`);
  };

  const recovered = await supabase.rpc('nav_v2_get_dashboard', {}, 2000);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.source, 'recovered-after-lock-failure');
  assert.equal(recoveredInitialRpcCalls, 1);
  assert.equal(recoveredRefreshCalls, 1, 'a later call must be able to start a new refresh');
  assert.equal(recoveredRetryCalls, 1);
  assert.equal(lockCalls.length, lockBaseline + 2, 'recovery must acquire the lock again');
  assert.equal(readSession()?.access_token, 'lock-new-access');
  assert.equal(readSession()?.refresh_token, 'lock-new-refresh');
}

// An AbortError from the refresh request represents the safeFetch timeout path.
// It must preserve session/profile state and release the shared refresh promise
// so the next attempt can refresh successfully.
{
  clearBrowserState();
  const oldSession = {
    access_token: 'timeout-old-access',
    refresh_token: 'timeout-old-refresh',
    user: { id: 'timeout-user', email: 'timeout-user@example.test' }
  };
  saveSession(oldSession);
  globalThis.sessionStorage.setItem('nav_profile_v2:timeout-user', JSON.stringify({ role: 'lawyer' }));
  lockMode = 'success';

  let phase = 'timeout';
  let timeoutInitialRpcCalls = 0;
  let timeoutRefreshCalls = 0;
  let timeoutRetryCalls = 0;
  let recoveryInitialRpcCalls = 0;
  let recoveryRefreshCalls = 0;
  let recoveryRetryCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      if (phase === 'timeout') {
        timeoutRefreshCalls += 1;
        const error = new Error('synthetic refresh timeout');
        error.name = 'AbortError';
        throw error;
      }
      recoveryRefreshCalls += 1;
      return jsonResponse(200, {
        access_token: 'timeout-new-access',
        refresh_token: 'timeout-new-refresh',
        user: { id: 'timeout-user', email: 'timeout-user@example.test' }
      });
    }
    if (normalized.includes('/rest/v1/rpc/')) {
      const authorization = bearer(options);
      if (authorization === 'Bearer timeout-old-access') {
        if (phase === 'timeout') timeoutInitialRpcCalls += 1;
        else recoveryInitialRpcCalls += 1;
        return jsonResponse(401, { message: 'JWT expired' });
      }
      if (authorization === 'Bearer timeout-new-access') {
        recoveryRetryCalls += 1;
        return jsonResponse(200, { ok: true, source: 'recovered-after-refresh-timeout' });
      }
      timeoutRetryCalls += 1;
      throw new Error('RPC must not retry while refresh is timed out');
    }
    throw new Error(`Unexpected timeout request: ${normalized}`);
  };

  await assert.rejects(
    () => supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    /Supabase не ответил за 12 сек/
  );

  assert.equal(timeoutInitialRpcCalls, 1);
  assert.equal(timeoutRefreshCalls, 1);
  assert.equal(timeoutRetryCalls, 0, 'RPC must not retry after refresh timeout');
  assert.deepEqual(readSession(), oldSession, 'refresh timeout must preserve the recoverable session');
  assert.deepEqual(
    JSON.parse(globalThis.sessionStorage.getItem('nav_profile_v2:timeout-user')),
    { role: 'lawyer' },
    'refresh timeout must preserve profile cache'
  );

  phase = 'recovered';
  const recovered = await supabase.rpc('nav_v2_get_dashboard', {}, 2000);
  assert.equal(recovered.ok, true);
  assert.equal(recovered.source, 'recovered-after-refresh-timeout');
  assert.equal(recoveryInitialRpcCalls, 1);
  assert.equal(recoveryRefreshCalls, 1, 'refreshRequest must be cleared after timeout rejection');
  assert.equal(recoveryRetryCalls, 1);
  assert.equal(readSession()?.access_token, 'timeout-new-access');
  assert.equal(readSession()?.refresh_token, 'timeout-new-refresh');
}

// A second 401 or 403 after a successful token refresh must surface exactly
// once. The RPC layer must not enter a second refresh loop and must retain the
// replacement session for subsequent user action or diagnosis.
for (const postRefreshStatus of [401, 403]) {
  clearBrowserState();
  lockMode = 'success';
  saveSession({
    access_token: `post-${postRefreshStatus}-old-access`,
    refresh_token: `post-${postRefreshStatus}-old-refresh`,
    user: { id: `post-${postRefreshStatus}-user`, email: `post-${postRefreshStatus}@example.test` }
  });

  let initialRpcCalls = 0;
  let refreshCalls = 0;
  let postRefreshRpcCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      refreshCalls += 1;
      return jsonResponse(200, {
        access_token: `post-${postRefreshStatus}-new-access`,
        refresh_token: `post-${postRefreshStatus}-new-refresh`,
        user: { id: `post-${postRefreshStatus}-user`, email: `post-${postRefreshStatus}@example.test` }
      });
    }
    if (normalized.includes('/rest/v1/rpc/')) {
      const authorization = bearer(options);
      if (authorization === `Bearer post-${postRefreshStatus}-old-access`) {
        initialRpcCalls += 1;
        return jsonResponse(401, { message: 'JWT expired' });
      }
      if (authorization === `Bearer post-${postRefreshStatus}-new-access`) {
        postRefreshRpcCalls += 1;
        return jsonResponse(postRefreshStatus, {
          message: postRefreshStatus === 401
            ? 'JWT rejected after refresh'
            : 'Permission denied after refresh'
        });
      }
    }
    throw new Error(`Unexpected post-refresh request: ${normalized}`);
  };

  await assert.rejects(
    () => supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    (error) => {
      assert.equal(error.status, postRefreshStatus);
      assert.match(error.message, /after refresh/i);
      return true;
    }
  );

  assert.equal(initialRpcCalls, 1);
  assert.equal(refreshCalls, 1, `post-refresh ${postRefreshStatus} must not start a second refresh`);
  assert.equal(postRefreshRpcCalls, 1, `post-refresh ${postRefreshStatus} must surface after one retry`);
  assert.equal(readSession()?.access_token, `post-${postRefreshStatus}-new-access`);
  assert.equal(readSession()?.refresh_token, `post-${postRefreshStatus}-new-refresh`);
}

console.log('Navigator v2 Auth lock/timeout/post-refresh tests passed');
