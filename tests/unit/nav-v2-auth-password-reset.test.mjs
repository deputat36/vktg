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

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {}
});
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    location: {
      href: 'https://example.test/app/nav-access-v2.html'
    }
  }
});

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const supabase = await import(`../../assets/js/nav-v2/supabase-v2.js?password-reset=${Date.now()}`);

// Blank input must fail before network and must not mutate remembered email.
{
  clearBrowserState();
  globalThis.localStorage.setItem('nav_last_email_v2', 'existing@example.test');

  let networkCalls = 0;
  globalThis.fetch = async () => {
    networkCalls += 1;
    throw new Error('blank reset input must not call network');
  };

  await assert.rejects(
    () => supabase.requestPasswordReset('   '),
    /Введите email, для которого нужно восстановить пароль/
  );

  assert.equal(networkCalls, 0);
  assert.equal(globalThis.localStorage.getItem('nav_last_email_v2'), 'existing@example.test');
}

// Successful recovery request must trim the email, use the dedicated invite
// acceptance page as redirect target, remember the clean email only after the
// server accepts the request, and preserve an existing authenticated session.
{
  clearBrowserState();
  const activeSession = {
    access_token: 'reset-success-access',
    refresh_token: 'reset-success-refresh',
    user: { id: 'reset-success-user', email: 'active-session@example.test' }
  };
  saveSession(activeSession);
  globalThis.sessionStorage.setItem(
    'nav_profile_v2:reset-success-user',
    JSON.stringify({ role: 'manager' })
  );

  let recoveryCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    recoveryCalls += 1;
    const parsedUrl = new URL(String(url));
    assert.equal(parsedUrl.pathname, '/auth/v1/recover');
    assert.equal(
      parsedUrl.searchParams.get('redirect_to'),
      'https://example.test/app/nav-accept-invite-v2.html'
    );
    assert.equal(options.method, 'POST');
    assert.equal(options.headers?.['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(String(options.body)), {
      email: 'reset-user@example.test'
    });
    return jsonResponse(200, {});
  };

  const result = await supabase.requestPasswordReset('  reset-user@example.test  ');

  assert.equal(result, true);
  assert.equal(recoveryCalls, 1);
  assert.deepEqual(readSession(), activeSession, 'password reset must not replace the active session');
  assert.deepEqual(
    JSON.parse(globalThis.sessionStorage.getItem('nav_profile_v2:reset-success-user')),
    { role: 'manager' },
    'password reset must not clear the active profile cache'
  );
  assert.equal(globalThis.localStorage.getItem('nav_last_email_v2'), 'reset-user@example.test');
}

// A transport failure must preserve session/profile state and must not replace
// the previously remembered login email with an unaccepted reset address.
{
  clearBrowserState();
  const activeSession = {
    access_token: 'reset-network-access',
    refresh_token: 'reset-network-refresh',
    user: { id: 'reset-network-user', email: 'reset-network-active@example.test' }
  };
  saveSession(activeSession);
  globalThis.sessionStorage.setItem(
    'nav_profile_v2:reset-network-user',
    JSON.stringify({ role: 'spn' })
  );
  globalThis.localStorage.setItem('nav_last_email_v2', 'previous-login@example.test');

  let recoveryCalls = 0;
  globalThis.fetch = async () => {
    recoveryCalls += 1;
    throw new Error('synthetic password reset offline');
  };

  await assert.rejects(
    () => supabase.requestPasswordReset('network-attempt@example.test'),
    /Не удалось подключиться к Supabase: synthetic password reset offline/
  );

  assert.equal(recoveryCalls, 1);
  assert.deepEqual(readSession(), activeSession);
  assert.deepEqual(
    JSON.parse(globalThis.sessionStorage.getItem('nav_profile_v2:reset-network-user')),
    { role: 'spn' }
  );
  assert.equal(globalThis.localStorage.getItem('nav_last_email_v2'), 'previous-login@example.test');
}

// AbortError uses the dedicated 12-second recovery timeout message. It must not
// mutate local auth state or remember an email that the server never accepted.
{
  clearBrowserState();
  const activeSession = {
    access_token: 'reset-timeout-access',
    refresh_token: 'reset-timeout-refresh',
    user: { id: 'reset-timeout-user', email: 'reset-timeout-active@example.test' }
  };
  saveSession(activeSession);
  globalThis.localStorage.setItem('nav_last_email_v2', 'timeout-previous@example.test');

  globalThis.fetch = async () => {
    const error = new Error('synthetic password reset timeout');
    error.name = 'AbortError';
    throw error;
  };

  await assert.rejects(
    () => supabase.requestPasswordReset('timeout-attempt@example.test'),
    /Supabase не ответил за 12 сек/
  );

  assert.deepEqual(readSession(), activeSession);
  assert.equal(globalThis.localStorage.getItem('nav_last_email_v2'), 'timeout-previous@example.test');
}

// Server rejection/rate limiting must surface the server message while keeping
// the existing session and remembered login email unchanged.
{
  clearBrowserState();
  const activeSession = {
    access_token: 'reset-rate-access',
    refresh_token: 'reset-rate-refresh',
    user: { id: 'reset-rate-user', email: 'reset-rate-active@example.test' }
  };
  saveSession(activeSession);
  globalThis.sessionStorage.setItem(
    'nav_profile_v2:reset-rate-user',
    JSON.stringify({ role: 'lawyer' })
  );
  globalThis.localStorage.setItem('nav_last_email_v2', 'rate-previous@example.test');

  let recoveryCalls = 0;
  globalThis.fetch = async () => {
    recoveryCalls += 1;
    return jsonResponse(429, {
      message: 'Too many reset requests',
      code: 'over_request_rate_limit'
    });
  };

  await assert.rejects(
    () => supabase.requestPasswordReset('rate-attempt@example.test'),
    (error) => {
      assert.equal(error.status, 429);
      assert.equal(error.code, 'over_request_rate_limit');
      assert.match(error.message, /Too many reset requests/);
      return true;
    }
  );

  assert.equal(recoveryCalls, 1);
  assert.deepEqual(readSession(), activeSession);
  assert.deepEqual(
    JSON.parse(globalThis.sessionStorage.getItem('nav_profile_v2:reset-rate-user')),
    { role: 'lawyer' }
  );
  assert.equal(globalThis.localStorage.getItem('nav_last_email_v2'), 'rate-previous@example.test');
}

console.log('Navigator v2 Auth password reset tests passed');
