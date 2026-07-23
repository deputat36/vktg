import assert from 'node:assert/strict';

class ControlledStorage {
  constructor() {
    Object.defineProperty(this, '_values', { value: new Map(), enumerable: false });
    Object.defineProperty(this, '_failures', {
      value: { get: null, set: null, remove: null },
      enumerable: false
    });
  }

  get length() {
    return this._values.size;
  }

  setFailure(operation, predicate) {
    this._failures[operation] = predicate;
  }

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

  key(index) {
    return [...this._values.keys()][index] ?? null;
  }

  peek(key) {
    return this._values.get(String(key)) ?? null;
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

const supabase = await import(`../../assets/js/nav-v2/supabase-v2.js?storage-write-gap=${Date.now()}`);

// Known gap 1: a convenience-email write failure interrupts invalid-session
// cleanup before the stale session and profile cache are removed.
{
  resetBrowserState();
  const session = {
    access_token: 'gap-invalid-access',
    refresh_token: 'gap-invalid-refresh',
    user: { id: 'gap-invalid-user', email: 'gap-invalid@example.test' }
  };
  saveSession(session);
  saveProfile('gap-invalid-user', { role: 'spn' });
  globalThis.localStorage.setFailure('set', (key) => key === 'nav_last_email_v2');

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
    (error) => {
      assert.equal(error.name, 'QuotaExceededError');
      return true;
    }
  );

  assert.equal(rpcCalls, 1);
  assert.equal(refreshCalls, 1);
  assert.equal(readRawSession()?.access_token, session.access_token, 'known gap: stale session remains stored');
  assert.notEqual(
    globalThis.sessionStorage.peek('nav_profile_v2:gap-invalid-user'),
    null,
    'known gap: profile cache remains because cleanup was interrupted'
  );
}

// Known gap 2: removeItem failure during logout throws before profile cleanup.
{
  resetBrowserState();
  const session = {
    access_token: 'gap-logout-access',
    refresh_token: 'gap-logout-refresh',
    user: { id: 'gap-logout-user', email: 'gap-logout@example.test' }
  };
  saveSession(session);
  saveProfile('gap-logout-user', { role: 'manager' });
  globalThis.localStorage.setFailure('remove', (key) => key === 'nav_session_v2');

  let logoutCalls = 0;
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/logout')) {
      logoutCalls += 1;
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected logout request: ${normalized}`);
  };

  await assert.rejects(
    () => supabase.signOut(),
    (error) => {
      assert.equal(error.name, 'SecurityError');
      return true;
    }
  );

  assert.equal(logoutCalls, 1);
  assert.equal(readRawSession()?.access_token, session.access_token, 'known gap: logout leaves stored session');
  assert.notEqual(
    globalThis.sessionStorage.peek('nav_profile_v2:gap-logout-user'),
    null,
    'known gap: profile cache cleanup is skipped'
  );
}

// Known gap 3: an optional profile-cache write failure turns a successful RPC
// into an application error.
{
  resetBrowserState();
  saveSession({
    access_token: 'gap-profile-access',
    refresh_token: 'gap-profile-refresh',
    user: { id: 'gap-profile-user', email: 'gap-profile@example.test' }
  });
  globalThis.sessionStorage.setFailure('set', (key) => key.startsWith('nav_profile_v2:'));

  let rpcCalls = 0;
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    if (normalized.includes('/rest/v1/rpc/nav_v2_get_my_profile')) {
      rpcCalls += 1;
      return jsonResponse(200, { profile: { id: 'gap-profile-user', role: 'lawyer' } });
    }
    throw new Error(`Unexpected profile request: ${normalized}`);
  };

  await assert.rejects(
    () => supabase.rpc('nav_v2_get_my_profile', {}, 2000),
    (error) => {
      assert.equal(error.name, 'QuotaExceededError');
      return true;
    }
  );
  assert.equal(rpcCalls, 1, 'the server request itself succeeded once');
  assert.equal(readRawSession()?.access_token, 'gap-profile-access');
}

// Known gap 4: password-reset success is reported as a failure when saving the
// convenience email is unavailable.
{
  resetBrowserState();
  saveSession({
    access_token: 'gap-reset-access',
    refresh_token: 'gap-reset-refresh',
    user: { id: 'gap-reset-user', email: 'gap-reset@example.test' }
  });
  saveProfile('gap-reset-user', { role: 'spn' });
  globalThis.localStorage.setItem('nav_last_email_v2', 'previous@example.test');
  globalThis.localStorage.setFailure('set', (key) => key === 'nav_last_email_v2');

  let recoverCalls = 0;
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/recover')) {
      recoverCalls += 1;
      return jsonResponse(200, {});
    }
    throw new Error(`Unexpected password-reset request: ${normalized}`);
  };

  await assert.rejects(
    () => supabase.requestPasswordReset('new-reset@example.test'),
    (error) => {
      assert.equal(error.name, 'QuotaExceededError');
      return true;
    }
  );
  assert.equal(recoverCalls, 1, 'the reset request was accepted before the local write failed');
  assert.equal(globalThis.localStorage.peek('nav_last_email_v2'), 'previous@example.test');
  assert.equal(readRawSession()?.access_token, 'gap-reset-access');
  assert.notEqual(globalThis.sessionStorage.peek('nav_profile_v2:gap-reset-user'), null);
}

// Known gap 5: successful password authentication cannot be persisted when the
// session write fails. The flow is fail-closed, but the raw storage error is not
// normalized for the user.
{
  resetBrowserState();
  globalThis.localStorage.setFailure('set', (key) => key === 'nav_session_v2');

  let passwordCalls = 0;
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    if (normalized.includes('/auth/v1/token?grant_type=password')) {
      passwordCalls += 1;
      return jsonResponse(200, {
        access_token: 'gap-signin-access',
        refresh_token: 'gap-signin-refresh',
        user: { id: 'gap-signin-user', email: 'gap-signin@example.test' }
      });
    }
    throw new Error(`Unexpected sign-in request: ${normalized}`);
  };

  await assert.rejects(
    () => supabase.signIn('gap-signin@example.test', 'synthetic-password'),
    (error) => {
      assert.equal(error.name, 'QuotaExceededError');
      return true;
    }
  );
  assert.equal(passwordCalls, 1);
  assert.equal(readRawSession(), null, 'session write failure currently remains fail-closed');
  assert.equal(globalThis.localStorage.peek('nav_last_email_v2'), 'gap-signin@example.test');
}

console.log('Navigator v2 Auth storage write gap evidence passed');
