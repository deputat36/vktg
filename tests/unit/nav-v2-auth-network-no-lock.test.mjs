import assert from 'node:assert/strict';

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

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {}
});

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const supabase = await import(`../../assets/js/nav-v2/supabase-v2.js?network-no-lock=${Date.now()}`);

assert.equal(globalThis.navigator?.locks, undefined, 'the suite must exercise the no-Web-Locks fallback');

// Two parallel RPC failures must still share one module-level refresh promise
// when the browser does not expose navigator.locks.
{
  clearBrowserState();
  saveSession({
    access_token: 'no-lock-old-access',
    refresh_token: 'no-lock-old-refresh',
    user: { id: 'no-lock-user', email: 'no-lock@example.test' }
  });

  let initialRpcCalls = 0;
  let refreshCalls = 0;
  let retryRpcCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const normalized = String(url);

    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      refreshCalls += 1;
      await delayTurn();
      return jsonResponse(200, {
        access_token: 'no-lock-new-access',
        refresh_token: 'no-lock-new-refresh',
        user: { id: 'no-lock-user', email: 'no-lock@example.test' }
      });
    }

    if (normalized.includes('/rest/v1/rpc/')) {
      const authorization = bearer(options);
      if (authorization === 'Bearer no-lock-old-access') {
        initialRpcCalls += 1;
        return jsonResponse(401, { message: 'JWT expired' });
      }
      if (authorization === 'Bearer no-lock-new-access') {
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
  assert.equal(lawyerQueue.ok, true);
  assert.equal(initialRpcCalls, 2);
  assert.equal(refreshCalls, 1, 'module-level refreshRequest must prevent a refresh storm without Web Locks');
  assert.equal(retryRpcCalls, 2);
  assert.equal(readSession()?.access_token, 'no-lock-new-access');
  assert.equal(readSession()?.refresh_token, 'no-lock-new-refresh');
}

// A temporary refresh network failure must preserve the still-recoverable
// session and profile cache. The rejected shared promise must be cleared so a
// later RPC can start a new refresh and recover successfully.
{
  clearBrowserState();
  saveSession({
    access_token: 'network-old-access',
    refresh_token: 'network-old-refresh',
    user: { id: 'network-user', email: 'network@example.test' }
  });
  globalThis.sessionStorage.setItem('nav_profile_v2:network-user', JSON.stringify({ role: 'spn' }));

  let phase = 'outage';
  let outageInitialRpcCalls = 0;
  let outageRefreshCalls = 0;
  let outageRetryRpcCalls = 0;
  let recoveredInitialRpcCalls = 0;
  let recoveredRefreshCalls = 0;
  let recoveredRetryRpcCalls = 0;

  globalThis.fetch = async (url, options = {}) => {
    const normalized = String(url);

    if (normalized.includes('/auth/v1/token?grant_type=refresh_token')) {
      if (phase === 'outage') {
        outageRefreshCalls += 1;
        await delayTurn();
        throw new Error('synthetic offline refresh');
      }

      recoveredRefreshCalls += 1;
      return jsonResponse(200, {
        access_token: 'network-new-access',
        refresh_token: 'network-new-refresh',
        user: { id: 'network-user', email: 'network@example.test' }
      });
    }

    if (normalized.includes('/rest/v1/rpc/')) {
      const authorization = bearer(options);
      if (authorization === 'Bearer network-old-access') {
        if (phase === 'outage') outageInitialRpcCalls += 1;
        else recoveredInitialRpcCalls += 1;
        return jsonResponse(401, { message: 'JWT expired' });
      }
      if (authorization === 'Bearer network-new-access') {
        recoveredRetryRpcCalls += 1;
        return jsonResponse(200, { ok: true, source: 'recovered-after-network-outage' });
      }
      outageRetryRpcCalls += 1;
      throw new Error('RPC must not retry while refresh network is unavailable');
    }

    throw new Error(`Unexpected request: ${normalized}`);
  };

  const outageOutcomes = await Promise.allSettled([
    supabase.rpc('nav_v2_get_dashboard', {}, 2000),
    supabase.rpc('nav_v2_get_lawyer_queue', { p_limit: 10 }, 2000)
  ]);

  assert.equal(outageInitialRpcCalls, 2);
  assert.equal(outageRefreshCalls, 1, 'parallel outage callers must share one failed refresh promise');
  assert.equal(outageRetryRpcCalls, 0, 'RPCs must not retry after a transient refresh network failure');
  outageOutcomes.forEach((outcome) => {
    assert.equal(outcome.status, 'rejected');
    assert.match(outcome.reason?.message || '', /Не удалось подключиться к Supabase: synthetic offline refresh/);
  });

  assert.equal(readSession()?.access_token, 'network-old-access', 'transient network failure must not invalidate the stored session');
  assert.equal(readSession()?.refresh_token, 'network-old-refresh');
  assert.deepEqual(
    JSON.parse(globalThis.sessionStorage.getItem('nav_profile_v2:network-user')),
    { role: 'spn' },
    'transient network failure must not clear the profile cache'
  );

  phase = 'recovered';
  const recovered = await supabase.rpc('nav_v2_get_dashboard', {}, 2000);

  assert.equal(recovered.ok, true);
  assert.equal(recovered.source, 'recovered-after-network-outage');
  assert.equal(recoveredInitialRpcCalls, 1, 'later RPC must retry the old access token once before refreshing');
  assert.equal(recoveredRefreshCalls, 1, 'refreshRequest must be cleared after rejection so a later refresh can start');
  assert.equal(recoveredRetryRpcCalls, 1);
  assert.equal(readSession()?.access_token, 'network-new-access');
  assert.equal(readSession()?.refresh_token, 'network-new-refresh');
}

console.log('Navigator v2 Auth network/no-lock recovery tests passed');
