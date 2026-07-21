import assert from 'node:assert/strict';

import {
  NAV_AUTH_SESSION_EXPIRED,
  classifyAuthSessionError,
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

{
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
  saveSession({
    access_token: 'expired-access-token',
    refresh_token: 'revoked-refresh-token',
    user: { id: 'user-invalid-refresh', email: 'spn@example.test' }
  });
  globalThis.sessionStorage.setItem('nav_profile_v2:user-invalid-refresh', JSON.stringify({ role: 'spn' }));

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

  await assert.rejects(
    () => supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    /Сначала войдите в систему/
  );
  assert.equal(calls.length, 2, 'a cleared session must not start another network loop');
}

{
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
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
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
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

console.log('Navigator v2 auth session recovery tests passed');
