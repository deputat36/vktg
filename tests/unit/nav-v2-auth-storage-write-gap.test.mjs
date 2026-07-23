import assert from 'node:assert/strict';

class ControlledStorage {
  constructor() {
    Object.defineProperty(this, '_values', { value: new Map(), enumerable: false });
    Object.defineProperty(this, '_failures', {
      value: { get: null, set: null, remove: null },
      enumerable: false
    });
  }

  get length() { return this._values.size; }

  setFailure(operation, predicate) { this._failures[operation] = predicate; }

  clearFailures() {
    this._failures.get = null;
    this._failures.set = null;
    this._failures.remove = null;
  }

  storageError(operation, key) {
    const error = new Error(`Synthetic ${operation} failure for ${key}`);
    error.name = operation === 'set' ? 'QuotaExceededError' : 'SecurityError';
    return error;
  }

  shouldFail(operation, key) {
    return Boolean(this._failures[operation]?.(String(key)));
  }

  getItem(key) {
    const normalizedKey = String(key);
    if (this.shouldFail('get', normalizedKey)) throw this.storageError('get', normalizedKey);
    return this._values.has(normalizedKey) ? this._values.get(normalizedKey) : null;
  }

  setItem(key, value) {
    const normalizedKey = String(key);
    if (this.shouldFail('set', normalizedKey)) throw this.storageError('set', normalizedKey);
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
    if (this.shouldFail('remove', normalizedKey)) throw this.storageError('remove', normalizedKey);
    this._values.delete(normalizedKey);
    delete this[normalizedKey];
  }

  clear() {
    for (const key of this._values.keys()) delete this[key];
    this._values.clear();
    this.clearFailures();
  }

  key(index) { return [...this._values.keys()][index] ?? null; }
  peek(key) { return this._values.get(String(key)) ?? null; }
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

function saveProfile(userId, profile) {
  globalThis.sessionStorage.setItem(`nav_profile_v2:${userId}`, JSON.stringify(profile));
}

function readRawSession() {
  const value = globalThis.localStorage.peek('nav_session_v2');
  return value ? JSON.parse(value) : null;
}

function resetBrowserState() {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
  delete globalThis.fetch;
}

async function loadSupabase(label) {
  return import(`../../assets/js/nav-v2/supabase-v2.js?storage-write-regression=${label}-${Date.now()}-${Math.random()}`);
}

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { location: { href: 'https://example.test/app/nav-access-v2.html' } }
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    locks: {
      request: async (name, options, callback) => callback({ name, options })
    }
  }
});

globalThis.localStorage = new ControlledStorage();
globalThis.sessionStorage = new ControlledStorage();

// Fixed regression 1: convenience-email failure cannot interrupt invalid-session cleanup.
{
  resetBrowserState();
  const session = {
    access_token: 'fixed-invalid-access',
    refresh_token: 'fixed-invalid-refresh',
    user: { id: 'fixed-invalid-user', email: 'fixed-invalid@example.test' }
  };
  saveSession(session);
  saveProfile('fixed-invalid-user', { role: 'spn' });
  globalThis.localStorage.setFailure('set', (key) => key === 'nav_last_email_v2');
  const supabase = await loadSupabase('invalid-refresh');

  let rpcCalls = 0;
  let refreshCalls = 0;
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    if (normalized.includes('/rest/v1/rpc/')) {
      rpcCalls += 1;
      return jsonResponse(401, { message: 'JWT expired' });
    }
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      refreshCalls += 1;
      return jsonResponse(400, {
        error_code: 'refresh_token_not_found',
        msg: 'Invalid Refresh Token: Refresh Token Not Found'
      });
    }
    throw new Error(`Unexpected invalid-session request: ${normalized}`);
  };

  await assert.rejects(
    () => supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    (error) => error.code === 'NAV_AUTH_SESSION_EXPIRED'
  );
  assert.equal(rpcCalls, 1, 'invalid refresh must not retry the RPC');
  assert.equal(refreshCalls, 1);
  assert.equal(readRawSession(), null, 'stale session must be removed or overwritten with null');
  assert.equal(globalThis.sessionStorage.peek('nav_profile_v2:fixed-invalid-user'), null);
  assert.equal(supabase.getCachedUser(), null);
}

// Fixed regression 2: logout cleanup survives localStorage.removeItem failure.
{
  resetBrowserState();
  const session = {
    access_token: 'fixed-logout-access',
    refresh_token: 'fixed-logout-refresh',
    user: { id: 'fixed-logout-user', email: 'fixed-logout@example.test' }
  };
  saveSession(session);
  saveProfile('fixed-logout-user', { role: 'manager' });
  globalThis.localStorage.setFailure('remove', (key) => key === 'nav_session_v2');
  const supabase = await loadSupabase('logout-remove');

  let logoutCalls = 0;
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/logout')) {
      logoutCalls += 1;
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected logout request: ${normalized}`);
  };

  await supabase.signOut();
  assert.equal(logoutCalls, 1);
  assert.equal(readRawSession(), null, 'fallback null overwrite must clear the persistent session');
  assert.equal(globalThis.sessionStorage.peek('nav_profile_v2:fixed-logout-user'), null);
  assert.equal(supabase.getCachedUser(), null);
}

// Fixed regression 3: optional profile-cache failure cannot change a successful RPC result.
{
  resetBrowserState();
  saveSession({
    access_token: 'fixed-profile-access',
    refresh_token: 'fixed-profile-refresh',
    user: { id: 'fixed-profile-user', email: 'fixed-profile@example.test' }
  });
  globalThis.sessionStorage.setFailure('set', (key) => key.startsWith('nav_profile_v2:'));
  const supabase = await loadSupabase('profile-cache');

  let rpcCalls = 0;
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    if (normalized.includes('/rest/v1/rpc/nav_v2_get_my_profile')) {
      rpcCalls += 1;
      return jsonResponse(200, { profile: { id: 'fixed-profile-user', role: 'lawyer' } });
    }
    throw new Error(`Unexpected profile request: ${normalized}`);
  };

  const data = await supabase.rpc('nav_v2_get_my_profile', {}, 2000);
  assert.equal(rpcCalls, 1);
  assert.equal(data.profile.role, 'lawyer');
  assert.equal(globalThis.sessionStorage.peek('nav_profile_v2:fixed-profile-user'), null);
  assert.equal(supabase.getCachedUser()?.id, 'fixed-profile-user');
}

// Fixed regression 4: accepted password reset stays successful when remembered-email write fails.
{
  resetBrowserState();
  saveSession({
    access_token: 'fixed-reset-access',
    refresh_token: 'fixed-reset-refresh',
    user: { id: 'fixed-reset-user', email: 'fixed-reset@example.test' }
  });
  saveProfile('fixed-reset-user', { role: 'spn' });
  globalThis.localStorage.setItem('nav_last_email_v2', 'previous@example.test');
  globalThis.localStorage.setFailure('set', (key) => key === 'nav_last_email_v2');
  const supabase = await loadSupabase('password-reset');

  let recoverCalls = 0;
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/recover')) {
      recoverCalls += 1;
      return jsonResponse(200, {});
    }
    throw new Error(`Unexpected password-reset request: ${normalized}`);
  };

  assert.equal(await supabase.requestPasswordReset('new-reset@example.test'), true);
  assert.equal(recoverCalls, 1);
  assert.equal(globalThis.localStorage.peek('nav_last_email_v2'), 'previous@example.test');
  assert.equal(readRawSession()?.access_token, 'fixed-reset-access');
  assert.notEqual(globalThis.sessionStorage.peek('nav_profile_v2:fixed-reset-user'), null);
}

// Fixed regression 5: sign-in persistence failure is normalized and never authenticates the page.
{
  resetBrowserState();
  globalThis.localStorage.setItem('nav_last_email_v2', 'previous-signin@example.test');
  globalThis.localStorage.setFailure('set', (key) => key === 'nav_session_v2');
  const supabase = await loadSupabase('signin-persist');

  let passwordCalls = 0;
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/token?grant_type=password')) {
      passwordCalls += 1;
      return jsonResponse(200, {
        access_token: 'fixed-signin-access',
        refresh_token: 'fixed-signin-refresh',
        user: { id: 'fixed-signin-user', email: 'fixed-signin@example.test' }
      });
    }
    throw new Error(`Unexpected sign-in request: ${normalized}`);
  };

  await assert.rejects(
    () => supabase.signIn('fixed-signin@example.test', 'synthetic-password'),
    (error) => {
      assert.equal(error.code, 'NAV_AUTH_STORAGE_UNAVAILABLE');
      assert.equal(error.isAuthStorageUnavailable, true);
      assert.equal(error.operation, 'save');
      return true;
    }
  );
  assert.equal(passwordCalls, 1);
  assert.equal(readRawSession(), null);
  assert.equal(supabase.getCachedUser(), null);
  assert.equal(globalThis.localStorage.peek('nav_last_email_v2'), 'previous-signin@example.test');
}

// Fixed regression 6: refreshed session persistence failure blocks stale reads and RPC retry.
{
  resetBrowserState();
  const staleSession = {
    access_token: 'fixed-refresh-stale-access',
    refresh_token: 'fixed-refresh-token',
    user: { id: 'fixed-refresh-user', email: 'fixed-refresh@example.test' }
  };
  saveSession(staleSession);
  globalThis.localStorage.setFailure('set', (key) => key === 'nav_session_v2');
  const supabase = await loadSupabase('refresh-persist');

  let rpcCalls = 0;
  let refreshCalls = 0;
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    if (normalized.includes('/rest/v1/rpc/')) {
      rpcCalls += 1;
      return jsonResponse(401, { message: 'JWT expired' });
    }
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      refreshCalls += 1;
      return jsonResponse(200, {
        access_token: 'fixed-refresh-new-access',
        refresh_token: 'fixed-refresh-new-token',
        user: staleSession.user
      });
    }
    throw new Error(`Unexpected refresh-persist request: ${normalized}`);
  };

  await assert.rejects(
    () => supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    (error) => error.code === 'NAV_AUTH_STORAGE_UNAVAILABLE'
  );
  assert.equal(rpcCalls, 1, 'RPC must not retry without a persisted refreshed session');
  assert.equal(refreshCalls, 1);
  assert.equal(supabase.getCachedUser(), null, 'current-page tombstone must block stale session reuse');
  assert.equal(readRawSession()?.access_token, 'fixed-refresh-stale-access', 'raw stale value may remain but must be unreadable');
}

console.log('Navigator v2 Auth storage write fixed regressions passed');
