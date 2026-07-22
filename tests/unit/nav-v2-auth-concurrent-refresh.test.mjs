import assert from 'node:assert/strict';

import {
  NAV_AUTH_REFRESH_LOCK_NAME,
  NAV_AUTH_SESSION_EXPIRED
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

function delayTurn() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function rpcName(url) {
  return String(url).split('/rest/v1/rpc/')[1]?.split('?')[0] || '';
}

function bearer(options) {
  return String(options?.headers?.Authorization || '');
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

const supabase = await import(`../../assets/js/nav-v2/supabase-v2.js?concurrent=${Date.now()}`);

// Two different RPCs fail at the same time. They must share one token refresh,
// then retry independently with the replacement session.
{
  clearBrowserState();
  saveSession({
    access_token: 'concurrent-old-access',
    refresh_token: 'concurrent-old-refresh',
    user: { id: 'concurrent-valid-user', email: 'concurrent-valid@example.test' }
  });

  const lockBaseline = refreshLockCalls.length;
  let initialRpcCalls = 0;
  let refreshCalls = 0;
  let retryRpcCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const normalized = String(url);

    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      refreshCalls += 1;
      await delayTurn();
      return jsonResponse(200, {
        access_token: 'concurrent-new-access',
        refresh_token: 'concurrent-new-refresh',
        user: { id: 'concurrent-valid-user', email: 'concurrent-valid@example.test' }
      });
    }

    if (normalized.includes('/rest/v1/rpc/')) {
      const authorization = bearer(options);
      if (authorization === 'Bearer concurrent-old-access') {
        initialRpcCalls += 1;
        return jsonResponse(401, { message: 'JWT expired' });
      }
      if (authorization === 'Bearer concurrent-new-access') {
        retryRpcCalls += 1;
        return jsonResponse(200, { ok: true, rpc: rpcName(normalized) });
      }
    }

    throw new Error(`Unexpected request: ${normalized}`);
  };

  const [dashboard, lawyerQueue] = await Promise.all([
    supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    supabase.rpc('nav_v2_get_lawyer_queue', { p_limit: 10 }, 2000)
  ]);

  assert.equal(dashboard.ok, true);
  assert.equal(dashboard.rpc, 'nav_v2_get_dashboard');
  assert.equal(lawyerQueue.ok, true);
  assert.equal(lawyerQueue.rpc, 'nav_v2_get_lawyer_queue');
  assert.equal(initialRpcCalls, 2, 'both requests must observe the expired access token');
  assert.equal(refreshCalls, 1, 'parallel RPC failures must fan in to one refresh request');
  assert.equal(retryRpcCalls, 2, 'each original RPC must retry exactly once after the shared refresh');
  assert.equal(refreshLockCalls.length, lockBaseline + 1, 'shared refresh must acquire one exclusive lock');
  assert.equal(refreshLockCalls.at(-1)?.name, NAV_AUTH_REFRESH_LOCK_NAME);
  assert.equal(refreshLockCalls.at(-1)?.options?.mode, 'exclusive');
  assert.equal(readSession()?.access_token, 'concurrent-new-access');
  assert.equal(readSession()?.refresh_token, 'concurrent-new-refresh');
}

// The same fan-in rule must also prevent a refresh storm when the shared
// refresh token is invalid. Both RPCs reject, the session is cleared once,
// and neither RPC retries with an invalid session.
{
  clearBrowserState();
  saveSession({
    access_token: 'concurrent-invalid-access',
    refresh_token: 'concurrent-invalid-refresh',
    user: { id: 'concurrent-invalid-user', email: 'concurrent-invalid@example.test' }
  });

  const lockBaseline = refreshLockCalls.length;
  let initialRpcCalls = 0;
  let refreshCalls = 0;
  let retryRpcCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const normalized = String(url);

    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      refreshCalls += 1;
      await delayTurn();
      return jsonResponse(400, {
        error_code: 'refresh_token_not_found',
        msg: 'Invalid Refresh Token: Refresh Token Not Found'
      });
    }

    if (normalized.includes('/rest/v1/rpc/')) {
      if (bearer(options) === 'Bearer concurrent-invalid-access') {
        initialRpcCalls += 1;
        return jsonResponse(401, { message: 'JWT expired' });
      }
      retryRpcCalls += 1;
      throw new Error('RPC must not retry after shared invalid refresh failure');
    }

    throw new Error(`Unexpected request: ${normalized}`);
  };

  const outcomes = await Promise.allSettled([
    supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    supabase.rpc('nav_v2_get_lawyer_queue', { p_limit: 10 }, 2000)
  ]);

  assert.equal(initialRpcCalls, 2);
  assert.equal(refreshCalls, 1, 'invalid parallel refresh must still call the token endpoint once');
  assert.equal(retryRpcCalls, 0, 'invalid refresh must stop both RPCs before retry');
  assert.equal(refreshLockCalls.length, lockBaseline + 1);
  assert.equal(readSession(), null, 'shared invalid refresh must clear the stale session');
  assert.equal(outcomes.length, 2);
  outcomes.forEach((outcome) => {
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.reason?.code, NAV_AUTH_SESSION_EXPIRED);
    assert.equal(outcome.reason?.isAuthSessionExpired, true);
  });
}

console.log('Navigator v2 concurrent Auth refresh tests passed');
