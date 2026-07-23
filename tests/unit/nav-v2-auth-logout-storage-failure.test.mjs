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

function emptyResponse(status = 204) {
  return new Response(null, { status });
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

const memoryLocalStorage = new MemoryStorage();
const memorySessionStorage = new MemoryStorage();

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    locks: {
      request: async (name, options, callback) => callback({ name, options })
    }
  }
});

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: memoryLocalStorage
});
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  writable: true,
  value: memorySessionStorage
});

const supabase = await import(`../../assets/js/nav-v2/supabase-v2.js?logout-storage-failure=${Date.now()}`);

// Logout during a pending old refresh must clear local state immediately. When
// the delayed refresh finishes, it must not resurrect the removed session or
// retry the original RPC.
{
  clearBrowserState();
  saveSession({
    access_token: 'logout-race-old-access',
    refresh_token: 'logout-race-old-refresh',
    user: { id: 'logout-race-user', email: 'logout-race@example.test' }
  });
  globalThis.sessionStorage.setItem(
    'nav_profile_v2:logout-race-user',
    JSON.stringify({ role: 'spn' })
  );

  const refreshStarted = deferred();
  const refreshResponse = deferred();
  let initialRpcCalls = 0;
  let refreshCalls = 0;
  let logoutCalls = 0;
  let retryRpcCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const normalized = String(url);
    if (normalized.includes('/rest/v1/rpc/')) {
      if (bearer(options) === 'Bearer logout-race-old-access') {
        initialRpcCalls += 1;
        return jsonResponse(401, { message: 'JWT expired' });
      }
      retryRpcCalls += 1;
      throw new Error('RPC must not retry after logout removed the session');
    }
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      refreshCalls += 1;
      refreshStarted.resolve();
      return refreshResponse.promise;
    }
    if (normalized.endsWith('/auth/v1/logout')) {
      logoutCalls += 1;
      assert.equal(bearer(options), 'Bearer logout-race-old-access');
      return emptyResponse();
    }
    throw new Error(`Unexpected logout-race request: ${normalized}`);
  };

  const rpcPromise = supabase.rpc('nav_v2_get_dashboard', {}, 2000);
  await refreshStarted.promise;

  await supabase.signOut();
  assert.equal(readSession(), null, 'logout must clear the stored session before delayed refresh completes');
  assert.equal(
    globalThis.sessionStorage.getItem('nav_profile_v2:logout-race-user'),
    null,
    'logout must clear the profile cache'
  );

  refreshResponse.resolve(jsonResponse(200, {
    access_token: 'logout-race-delayed-access',
    refresh_token: 'logout-race-delayed-refresh',
    user: { id: 'logout-race-user', email: 'logout-race@example.test' }
  }));

  await assert.rejects(
    () => rpcPromise,
    (error) => {
      assert.equal(error.code, NAV_AUTH_SESSION_EXPIRED);
      return true;
    }
  );

  assert.equal(initialRpcCalls, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(logoutCalls, 1);
  assert.equal(retryRpcCalls, 0);
  assert.equal(readSession(), null, 'delayed refresh must not resurrect a logged-out session');
  assert.equal(
    globalThis.localStorage.getItem('nav_last_email_v2'),
    'logout-race@example.test',
    'only the clean-login convenience email may remain after the race'
  );
}

// A transport failure at the logout endpoint may be surfaced to the caller,
// but the finally block must still clear session and profile state.
{
  clearBrowserState();
  saveSession({
    access_token: 'logout-network-access',
    refresh_token: 'logout-network-refresh',
    user: { id: 'logout-network-user', email: 'logout-network@example.test' }
  });
  globalThis.sessionStorage.setItem(
    'nav_profile_v2:logout-network-user',
    JSON.stringify({ role: 'manager' })
  );

  let networkCalls = 0;
  globalThis.fetch = async (url) => {
    networkCalls += 1;
    const normalized = String(url);
    if (normalized.endsWith('/auth/v1/logout')) {
      throw new Error('synthetic logout offline');
    }
    throw new Error(`Unexpected logout-network request: ${normalized}`);
  };

  await assert.rejects(
    () => supabase.signOut(),
    /Не удалось подключиться к Supabase: synthetic logout offline/
  );

  assert.equal(networkCalls, 1);
  assert.equal(readSession(), null, 'logout network failure must still clear local session');
  assert.equal(
    globalThis.sessionStorage.getItem('nav_profile_v2:logout-network-user'),
    null,
    'logout network failure must still clear profile cache'
  );

  await assert.rejects(
    () => supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    /Сначала войдите в систему/
  );
  assert.equal(networkCalls, 1, 'cleared session must stop subsequent RPC before network');
}

// Logout with no current session must not call the network, but it should still
// clean stale profile cache entries left by an interrupted browser flow.
{
  clearBrowserState();
  globalThis.sessionStorage.setItem('nav_profile_v2:stale-a', JSON.stringify({ role: 'spn' }));
  globalThis.sessionStorage.setItem('nav_profile_v2:stale-b', JSON.stringify({ role: 'lawyer' }));

  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error('network must not be called without a session');
  };

  await supabase.signOut();

  assert.equal(networkCalls, 0);
  assert.equal(globalThis.sessionStorage.getItem('nav_profile_v2:stale-a'), null);
  assert.equal(globalThis.sessionStorage.getItem('nav_profile_v2:stale-b'), null);
}

// Browser privacy settings may deny storage reads. Cache readers must treat a
// SecurityError as an absent session/profile and stop protected actions before
// any network call.
{
  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error('network must not be called after storage read denial');
  };

  const deniedStorage = {
    getItem() {
      const error = new Error('synthetic browser storage read denied');
      error.name = 'SecurityError';
      throw error;
    }
  };

  globalThis.localStorage = deniedStorage;
  globalThis.sessionStorage = deniedStorage;

  assert.equal(supabase.getCachedUser(), null, 'storage SecurityError must be treated as no cached user');
  assert.equal(supabase.getCachedProfile(), null, 'storage SecurityError must be treated as no cached profile');
  assert.throws(() => supabase.requireUser(), /Сначала войдите в систему/);
  assert.equal(networkCalls, 0);

  globalThis.localStorage = memoryLocalStorage;
  globalThis.sessionStorage = memorySessionStorage;
  clearBrowserState();
}

console.log('Navigator v2 Auth logout/storage failure tests passed');
