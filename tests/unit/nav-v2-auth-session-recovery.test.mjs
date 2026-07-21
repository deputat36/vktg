import assert from 'node:assert/strict';

import {
  NAV_AUTH_REFRESH_LOCK_NAME,
  NAV_AUTH_SESSION_EXPIRED,
  classifyAuthSessionError,
  hasSessionAdvancedSinceRequest,
  isReplacementAuthSession,
  isSameAuthSession,
  shouldInvalidateSessionAfterRefreshFailure
} from '../../assets/js/nav-v2/auth-session-recovery-v2.js';

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

const refreshLockCalls = [];
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    locks: {
      request: async (name, options, callback) => {
        refreshLockCalls.push({ name, options });
        return callback({ name });
      }
    }
  }
});

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const supabase = await import(`../../assets/js/nav-v2/supabase-v2.js?unit=${Date.now()}`);

assert.equal(
  classifyAuthSessionError({ code: 'refresh_token_not_found' }),
  'invalid_refresh_token'
);
assert.equal(
  classifyAuthSessionError({ message: 'Invalid Refresh Token: Refresh Token Not Found' }),
  'invalid_refresh_token'
);
assert.equal(
  shouldInvalidateSessionAfterRefreshFailure({ payload: { error_code: 'refresh_token_already_used' } }),
  true
);
assert.equal(
  shouldInvalidateSessionAfterRefreshFailure({ message: 'temporary network failure' }),
  false
);

const oldSession = {
  access_token: 'old-access-token',
  refresh_token: 'old-refresh-token',
  user: { id: 'user-session-helper', email: 'helper@example.test' }
};
const replacementSession = {
  access_token: 'new-access-token',
  refresh_token: 'new-refresh-token',
  user: { id: 'user-session-helper', email: 'helper@example.test' }
};
assert.equal(isSameAuthSession(oldSession, { ...oldSession }), true);
assert.equal(isSameAuthSession(oldSession, replacementSession), false);
assert.equal(isReplacementAuthSession(replacementSession, oldSession), true);
assert.equal(isReplacementAuthSession(null, oldSession), false);
assert.equal(hasSessionAdvancedSinceRequest(replacementSession, oldSession.access_token), true);
assert.equal(hasSessionAdvancedSinceRequest(oldSession, oldSession.access_token), false);

{
  clearBrowserState();
  saveSession({
    access_token: 'expired-access-token',
    refresh_token: 'revoked-refresh-token',
    user: { id: 'user-invalid-refresh', email: 'spn@example.test' }
  });
  globalThis.sessionStorage.setItem('nav_profile_v2:user-invalid-refresh', JSON.stringify({ role: 'spn' }));

  const lockBaseline = refreshLockCalls.length;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/rest/v1/rpc/')) {
      return jsonResponse(401, { message: 'JWT expired' });
    }
    if (String(url).includes('/auth/v1/token?grant_type=refresh_token')) {
      return jsonResponse(400, {
        error_code: 'refresh_token_not_found',
        msg: 'Invalid Refresh Token: Refresh Token Not Found'
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  await assert.rejects(
    () => supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    (error) => {
      assert.equal(error.code, NAV_AUTH_SESSION_EXPIRED);
      assert.equal(error.isAuthSessionExpired, true);
      assert.match(error.message, /Сессия истекла/);
      return true;
    }
  );

  assert.equal(readSession(), null, 'invalid refresh token must clear the stored session');
  assert.equal(
    globalThis.localStorage.getItem('nav_last_email_v2'),
    'spn@example.test',
    'email should remain available for the clean login form'
  );
  assert.equal(
    globalThis.sessionStorage.getItem('nav_profile_v2:user-invalid-refresh'),
    null,
    'profile cache must be cleared together with the invalid session'
  );
  assert.equal(calls.length, 2, 'invalid refresh flow must stop before a second RPC retry');
  assert.equal(refreshLockCalls.length, lockBaseline + 1, 'refresh flow must use one cross-tab lock');
  assert.equal(refreshLockCalls.at(-1)?.name, NAV_AUTH_REFRESH_LOCK_NAME);
  assert.equal(refreshLockCalls.at(-1)?.options?.mode, 'exclusive');

  await assert.rejects(
    () => supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    /Сначала войдите в систему/
  );
  assert.equal(calls.length, 2, 'a cleared session must not start another network loop');
}

{
  clearBrowserState();
  saveSession({
    access_token: 'old-access-token',
    refresh_token: 'valid-refresh-token',
    user: { id: 'user-valid-refresh', email: 'manager@example.test' }
  });

  const calls = [];
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    calls.push(normalized);
    if (calls.length === 1 && normalized.includes('/rest/v1/rpc/')) {
      return jsonResponse(401, { message: 'JWT expired' });
    }
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      return jsonResponse(200, {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        user: { id: 'user-valid-refresh', email: 'manager@example.test' }
      });
    }
    if (calls.length === 3 && normalized.includes('/rest/v1/rpc/')) {
      return jsonResponse(200, { ok: true, source: 'retried-after-refresh' });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await supabase.rpc('nav_v2_get_dashboard', {}, 2000);
  assert.equal(result.ok, true);
  assert.equal(result.source, 'retried-after-refresh');
  assert.equal(calls.length, 3, 'valid refresh must retry the RPC exactly once');
  assert.equal(readSession()?.access_token, 'new-access-token');
  assert.equal(readSession()?.refresh_token, 'new-refresh-token');
}

{
  clearBrowserState();
  saveSession({
    access_token: 'access-without-refresh',
    user: { id: 'user-missing-refresh', email: 'lawyer@example.test' }
  });

  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return jsonResponse(401, { message: 'JWT expired' });
  };

  await assert.rejects(
    () => supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    (error) => error.code === NAV_AUTH_SESSION_EXPIRED
  );
  assert.equal(readSession(), null);
  assert.equal(calls.length, 1, 'missing refresh token must not call the token endpoint');
}

{
  clearBrowserState();
  const attempted = {
    access_token: 'tab-a-old-access',
    refresh_token: 'tab-a-old-refresh',
    user: { id: 'user-tab-replaced-before', email: 'admin@example.test' }
  };
  const replaced = {
    access_token: 'tab-b-new-access',
    refresh_token: 'tab-b-new-refresh',
    user: { id: 'user-tab-replaced-before', email: 'admin@example.test' }
  };
  saveSession(attempted);

  const calls = [];
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    calls.push(normalized);
    if (calls.length === 1 && normalized.includes('/rest/v1/rpc/')) {
      saveSession(replaced);
      return jsonResponse(401, { message: 'JWT expired' });
    }
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      throw new Error('token endpoint must not be called after another tab refreshed');
    }
    if (calls.length === 2 && normalized.includes('/rest/v1/rpc/')) {
      return jsonResponse(200, { ok: true, source: 'new-session-before-lock' });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await supabase.rpc('nav_v2_get_dashboard', {}, 2000);
  assert.equal(result.source, 'new-session-before-lock');
  assert.equal(calls.length, 2, 'replacement session before lock must skip token refresh');
  assert.equal(readSession()?.refresh_token, replaced.refresh_token);
}

{
  clearBrowserState();
  const attempted = {
    access_token: 'tab-a-racing-access',
    refresh_token: 'tab-a-racing-refresh',
    user: { id: 'user-tab-race', email: 'spn-race@example.test' }
  };
  const replaced = {
    access_token: 'tab-b-racing-access',
    refresh_token: 'tab-b-racing-refresh',
    user: { id: 'user-tab-race', email: 'spn-race@example.test' }
  };
  saveSession(attempted);

  const calls = [];
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    calls.push(normalized);
    if (calls.length === 1 && normalized.includes('/rest/v1/rpc/')) {
      return jsonResponse(401, { message: 'JWT expired' });
    }
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      saveSession(replaced);
      return jsonResponse(400, {
        error_code: 'refresh_token_already_used',
        msg: 'Refresh token has already been used'
      });
    }
    if (calls.length === 3 && normalized.includes('/rest/v1/rpc/')) {
      return jsonResponse(200, { ok: true, source: 'replacement-won-race' });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await supabase.rpc('nav_v2_get_dashboard', {}, 2000);
  assert.equal(result.source, 'replacement-won-race');
  assert.equal(calls.length, 3);
  assert.equal(readSession()?.access_token, replaced.access_token, 'old rejected token must not clear a newer session');
  assert.equal(readSession()?.refresh_token, replaced.refresh_token);
}

{
  clearBrowserState();
  saveSession({
    access_token: 'logout-race-access',
    refresh_token: 'logout-race-refresh',
    user: { id: 'user-logout-race', email: 'logout-race@example.test' }
  });

  const calls = [];
  globalThis.fetch = async (url) => {
    const normalized = String(url);
    calls.push(normalized);
    if (calls.length === 1 && normalized.includes('/rest/v1/rpc/')) {
      return jsonResponse(401, { message: 'JWT expired' });
    }
    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      globalThis.localStorage.removeItem('nav_session_v2');
      return jsonResponse(200, {
        access_token: 'must-not-be-restored-access',
        refresh_token: 'must-not-be-restored-refresh',
        user: { id: 'user-logout-race', email: 'logout-race@example.test' }
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  await assert.rejects(
    () => supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    (error) => error.code === NAV_AUTH_SESSION_EXPIRED
  );
  assert.equal(calls.length, 2, 'logout during refresh must stop before RPC retry');
  assert.equal(readSession(), null, 'successful old refresh must not resurrect a session removed by another tab');
  assert.equal(globalThis.localStorage.getItem('nav_last_email_v2'), 'logout-race@example.test');
}

console.log('Navigator v2 auth session recovery tests passed');
