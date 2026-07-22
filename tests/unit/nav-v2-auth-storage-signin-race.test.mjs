import assert from 'node:assert/strict';

import { NAV_AUTH_SESSION_EXPIRED } from '../../assets/js/nav-v2/auth-session-recovery-v2.js';

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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    locks: {
      request: async (name, options, callback) => callback({ name, options })
    }
  }
});

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const supabase = await import(`../../assets/js/nav-v2/supabase-v2.js?storage-signin-race=${Date.now()}`);

// Malformed JSON in browser storage must be treated as an absent session/profile.
// A clean sign-in must clear stale profile caches and replace the malformed value.
{
  clearBrowserState();
  globalThis.localStorage.setItem('nav_session_v2', '{not-json');
  globalThis.sessionStorage.setItem('nav_profile_v2:anonymous', '{bad-profile-json');
  globalThis.sessionStorage.setItem('nav_profile_v2:stale-user', JSON.stringify({ role: 'spn' }));

  assert.equal(supabase.getCachedUser(), null, 'malformed session JSON must not create a cached user');
  assert.equal(supabase.getCachedProfile(), null, 'malformed profile JSON must not escape the cache reader');

  let networkCalls = 0;
  globalThis.fetch = async (url) => {
    networkCalls += 1;
    const normalized = String(url);
    if (normalized.includes('/auth/v1/token?grant_type=password')) {
      return jsonResponse(200, {
        access_token: 'storage-clean-access',
        refresh_token: 'storage-clean-refresh',
        user: { id: 'storage-clean-user', email: 'storage-clean@example.test' }
      });
    }
    throw new Error(`Unexpected malformed-storage request: ${normalized}`);
  };

  assert.throws(() => supabase.requireUser(), /Сначала войдите в систему/);
  assert.equal(networkCalls, 0, 'requireUser must fail before network when session JSON is malformed');

  const user = await supabase.signIn('storage-clean@example.test', 'synthetic-password');
  assert.equal(user.id, 'storage-clean-user');
  assert.equal(readSession()?.access_token, 'storage-clean-access');
  assert.equal(globalThis.localStorage.getItem('nav_last_email_v2'), 'storage-clean@example.test');
  assert.equal(globalThis.sessionStorage.getItem('nav_profile_v2:anonymous'), null);
  assert.equal(globalThis.sessionStorage.getItem('nav_profile_v2:stale-user'), null);
  assert.equal(networkCalls, 1);
}

// A successful same-user sign-in during an old pending refresh must win. The
// delayed refresh payload must never overwrite the newer password session.
{
  clearBrowserState();
  saveSession({
    access_token: 'same-old-access',
    refresh_token: 'same-old-refresh',
    user: { id: 'same-user', email: 'same-user@example.test' }
  });

  const refreshStarted = deferred();
  const refreshResponse = deferred();
  let initialRpcCalls = 0;
  let refreshCalls = 0;
  let passwordCalls = 0;
  let retryCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      refreshCalls += 1;
      refreshStarted.resolve();
      return refreshResponse.promise;
    }
    if (normalized.includes('/auth/v1/token?grant_type=password')) {
      passwordCalls += 1;
      return jsonResponse(200, {
        access_token: 'same-signin-access',
        refresh_token: 'same-signin-refresh',
        user: { id: 'same-user', email: 'same-user@example.test' }
      });
    }
    if (normalized.includes('/rest/v1/rpc/')) {
      const authorization = bearer(options);
      if (authorization === 'Bearer same-old-access') {
        initialRpcCalls += 1;
        return jsonResponse(401, { message: 'JWT expired' });
      }
      if (authorization === 'Bearer same-signin-access') {
        retryCalls += 1;
        return jsonResponse(200, { ok: true, source: 'same-user-signin-won' });
      }
    }
    throw new Error(`Unexpected same-user race request: ${normalized}`);
  };

  const rpcPromise = supabase.rpc('nav_v2_get_dashboard', {}, 2000);
  await refreshStarted.promise;

  const signedInUser = await supabase.signIn('same-user@example.test', 'synthetic-password');
  assert.equal(signedInUser.id, 'same-user');
  assert.equal(readSession()?.access_token, 'same-signin-access');

  refreshResponse.resolve(jsonResponse(200, {
    access_token: 'same-delayed-refresh-access',
    refresh_token: 'same-delayed-refresh-token',
    user: { id: 'same-user', email: 'same-user@example.test' }
  }));

  const result = await rpcPromise;
  assert.equal(result.ok, true);
  assert.equal(result.source, 'same-user-signin-won');
  assert.equal(initialRpcCalls, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(passwordCalls, 1);
  assert.equal(retryCalls, 1);
  assert.equal(readSession()?.access_token, 'same-signin-access', 'delayed refresh must not overwrite newer sign-in');
  assert.equal(readSession()?.refresh_token, 'same-signin-refresh');
}

// A different-user sign-in must also win over an old pending refresh. The old
// RPC may be denied after its single retry, but the new user's session remains.
{
  clearBrowserState();
  saveSession({
    access_token: 'old-user-access',
    refresh_token: 'old-user-refresh',
    user: { id: 'old-user', email: 'old-user@example.test' }
  });

  const refreshStarted = deferred();
  const refreshResponse = deferred();
  let refreshCalls = 0;
  let retryCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      refreshCalls += 1;
      refreshStarted.resolve();
      return refreshResponse.promise;
    }
    if (normalized.includes('/auth/v1/token?grant_type=password')) {
      return jsonResponse(200, {
        access_token: 'different-signin-access',
        refresh_token: 'different-signin-refresh',
        user: { id: 'different-user', email: 'different-user@example.test' }
      });
    }
    if (normalized.includes('/rest/v1/rpc/')) {
      const authorization = bearer(options);
      if (authorization === 'Bearer old-user-access') {
        return jsonResponse(401, { message: 'JWT expired' });
      }
      if (authorization === 'Bearer different-signin-access') {
        retryCalls += 1;
        return jsonResponse(403, { message: 'Old RPC is not permitted for the replacement user' });
      }
    }
    throw new Error(`Unexpected different-user race request: ${normalized}`);
  };

  const rpcPromise = supabase.rpc('nav_v2_get_dashboard', {}, 2000);
  await refreshStarted.promise;

  const signedInUser = await supabase.signIn('different-user@example.test', 'synthetic-password');
  assert.equal(signedInUser.id, 'different-user');

  refreshResponse.resolve(jsonResponse(200, {
    access_token: 'old-user-delayed-access',
    refresh_token: 'old-user-delayed-refresh',
    user: { id: 'old-user', email: 'old-user@example.test' }
  }));

  await assert.rejects(
    () => rpcPromise,
    (error) => {
      assert.equal(error.status, 403);
      assert.match(error.message, /replacement user/);
      return true;
    }
  );

  assert.equal(refreshCalls, 1);
  assert.equal(retryCalls, 1, 'old RPC must retry only once with the replacement session');
  assert.equal(readSession()?.user?.id, 'different-user');
  assert.equal(readSession()?.access_token, 'different-signin-access');
  assert.equal(readSession()?.refresh_token, 'different-signin-refresh');
}

// A failed sign-in clears the old session first. A delayed successful refresh
// from that old session must not resurrect it after the password failure.
{
  clearBrowserState();
  saveSession({
    access_token: 'failed-signin-old-access',
    refresh_token: 'failed-signin-old-refresh',
    user: { id: 'failed-signin-old-user', email: 'failed-signin-old@example.test' }
  });
  globalThis.sessionStorage.setItem(
    'nav_profile_v2:failed-signin-old-user',
    JSON.stringify({ role: 'manager' })
  );

  const refreshStarted = deferred();
  const refreshResponse = deferred();
  let refreshCalls = 0;
  let retryCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      refreshCalls += 1;
      refreshStarted.resolve();
      return refreshResponse.promise;
    }
    if (normalized.includes('/auth/v1/token?grant_type=password')) {
      return jsonResponse(400, {
        error_code: 'invalid_credentials',
        msg: 'Invalid login credentials'
      });
    }
    if (normalized.includes('/rest/v1/rpc/')) {
      if (bearer(options) === 'Bearer failed-signin-old-access') {
        return jsonResponse(401, { message: 'JWT expired' });
      }
      retryCalls += 1;
      throw new Error('RPC must not retry after failed sign-in removed the old session');
    }
    throw new Error(`Unexpected failed-signin race request: ${normalized}`);
  };

  const rpcPromise = supabase.rpc('nav_v2_get_dashboard', {}, 2000);
  await refreshStarted.promise;

  await assert.rejects(
    () => supabase.signIn('new-attempt@example.test', 'wrong-password'),
    /Invalid login credentials/
  );
  assert.equal(readSession(), null, 'failed sign-in must leave no stored session');
  assert.equal(
    globalThis.sessionStorage.getItem('nav_profile_v2:failed-signin-old-user'),
    null,
    'failed sign-in must clear old profile cache before password request'
  );

  refreshResponse.resolve(jsonResponse(200, {
    access_token: 'must-not-resurrect-access',
    refresh_token: 'must-not-resurrect-refresh',
    user: { id: 'failed-signin-old-user', email: 'failed-signin-old@example.test' }
  }));

  await assert.rejects(
    () => rpcPromise,
    (error) => {
      assert.equal(error.code, NAV_AUTH_SESSION_EXPIRED);
      return true;
    }
  );

  assert.equal(refreshCalls, 1);
  assert.equal(retryCalls, 0);
  assert.equal(readSession(), null, 'delayed old refresh must not resurrect a session after failed sign-in');
  assert.equal(
    globalThis.localStorage.getItem('nav_last_email_v2'),
    'failed-signin-old@example.test',
    'old email may remain only as a clean-login convenience value'
  );
}

console.log('Navigator v2 Auth storage/sign-in race tests passed');
