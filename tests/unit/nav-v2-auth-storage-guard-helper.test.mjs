import assert from 'node:assert/strict';

import {
  NAV_AUTH_STORAGE_UNAVAILABLE,
  createAuthStorageController,
  createAuthStorageUnavailableError
} from '../../assets/js/nav-v2/auth-storage-guard-v2.js';

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

  failure(operation, key) {
    const error = new Error(`Synthetic ${operation} failure for ${key}`);
    error.name = operation === 'set' ? 'QuotaExceededError' : 'SecurityError';
    return error;
  }

  shouldFail(operation, key) {
    return Boolean(this._failures[operation]?.(String(key)));
  }

  getItem(key) {
    const normalized = String(key);
    if (this.shouldFail('get', normalized)) throw this.failure('get', normalized);
    return this._values.has(normalized) ? this._values.get(normalized) : null;
  }

  setItem(key, value) {
    const normalized = String(key);
    if (this.shouldFail('set', normalized)) throw this.failure('set', normalized);
    const serialized = String(value);
    this._values.set(normalized, serialized);
    Object.defineProperty(this, normalized, {
      value: serialized,
      writable: true,
      configurable: true,
      enumerable: true
    });
  }

  removeItem(key) {
    const normalized = String(key);
    if (this.shouldFail('remove', normalized)) throw this.failure('remove', normalized);
    this._values.delete(normalized);
    delete this[normalized];
  }

  key(index) {
    return [...this._values.keys()][index] ?? null;
  }

  peek(key) {
    return this._values.get(String(key)) ?? null;
  }
}

function newController() {
  const local = new ControlledStorage();
  const session = new ControlledStorage();
  const controller = createAuthStorageController({ local, session });
  return { local, session, controller };
}

{
  const error = createAuthStorageUnavailableError('save', new Error('synthetic'));
  assert.equal(error.code, NAV_AUTH_STORAGE_UNAVAILABLE);
  assert.equal(error.isAuthStorageUnavailable, true);
  assert.equal(error.operation, 'save');
  assert.match(error.message, /Браузер не разрешил сохранить данные входа/);
}

// Malformed or denied reads are fail-closed.
{
  const { local, controller } = newController();
  local.setItem('nav_session_v2', '{not-json');
  assert.equal(controller.readSession(), null);

  local.setFailure('get', (key) => key === 'nav_session_v2');
  assert.equal(controller.readSession(), null);
}

// Remembered email is optional and never changes the primary operation result.
{
  const { local, controller } = newController();
  assert.equal(controller.rememberEmail('  user@example.test  '), true);
  assert.equal(local.peek('nav_last_email_v2'), 'user@example.test');

  local.setFailure('set', (key) => key === 'nav_last_email_v2');
  assert.equal(controller.rememberEmail('other@example.test'), false);
  assert.equal(local.peek('nav_last_email_v2'), 'user@example.test');
  assert.equal(controller.rememberEmail('   '), false);
}

// Optional profile cache writes fail open for the network result.
{
  const { session, controller } = newController();
  assert.equal(controller.saveProfile('nav_profile_v2:user-1', { role: 'spn' }), true);
  assert.equal(controller.readProfile('nav_profile_v2:user-1')?.role, 'spn');

  session.setFailure('set', (key) => key.startsWith('nav_profile_v2:'));
  assert.equal(controller.saveProfile('nav_profile_v2:user-2', { role: 'lawyer' }), false);
  assert.equal(controller.readProfile('nav_profile_v2:user-2'), null);
}

// removeItem failure falls back to a logical null overwrite and always clears profiles.
{
  const { local, session, controller } = newController();
  local.setItem('nav_session_v2', JSON.stringify({ access_token: 'old-access' }));
  session.setItem('nav_profile_v2:user-1', JSON.stringify({ role: 'manager' }));
  session.setItem('other_cache', 'keep');
  local.setFailure('remove', (key) => key === 'nav_session_v2');

  const result = controller.clearSession({ email: 'old@example.test' });
  assert.equal(result.persistentClearSucceeded, true);
  assert.equal(result.sessionReadBlocked, true);
  assert.equal(result.removeError?.name, 'SecurityError');
  assert.equal(local.peek('nav_session_v2'), 'null');
  assert.equal(local.peek('nav_last_email_v2'), 'old@example.test');
  assert.equal(session.peek('nav_profile_v2:user-1'), null);
  assert.equal(session.peek('other_cache'), 'keep');
  assert.equal(controller.readSession(), null);
  assert.equal(controller.isSessionReadBlocked(), true);
}

// If remove and overwrite both fail, the current page still blocks stale-session reads.
{
  const { local, session, controller } = newController();
  local.setItem('nav_session_v2', JSON.stringify({ access_token: 'must-not-reuse' }));
  session.setItem('nav_profile_v2:user-2', JSON.stringify({ role: 'broker' }));
  local.setFailure('remove', (key) => key === 'nav_session_v2');
  local.setFailure('set', (key) => key === 'nav_session_v2');

  const result = controller.clearSession();
  assert.equal(result.persistentClearSucceeded, false);
  assert.equal(controller.isSessionReadBlocked(), true);
  assert.equal(controller.readSession(), null);
  assert.match(local.peek('nav_session_v2'), /must-not-reuse/);
  assert.equal(session.peek('nav_profile_v2:user-2'), null);
}

// Profile cleanup continues after one key fails to remove.
{
  const { session, controller } = newController();
  session.setItem('nav_profile_v2:first', JSON.stringify({ role: 'spn' }));
  session.setItem('nav_profile_v2:second', JSON.stringify({ role: 'lawyer' }));
  session.setFailure('remove', (key) => key === 'nav_profile_v2:first');

  const cleared = controller.clearProfiles();
  assert.equal(cleared, 1);
  assert.notEqual(session.peek('nav_profile_v2:first'), null);
  assert.equal(session.peek('nav_profile_v2:second'), null);
}

// Session persistence failures are normalized and block stale reads.
{
  const { local, session, controller } = newController();
  local.setItem('nav_session_v2', JSON.stringify({ access_token: 'stale-access' }));
  session.setItem('nav_profile_v2:user-3', JSON.stringify({ role: 'viewer' }));
  local.setFailure('set', (key) => key === 'nav_session_v2');

  assert.throws(
    () => controller.persistSession({ access_token: 'new-access', refresh_token: 'new-refresh' }),
    (error) => {
      assert.equal(error.code, NAV_AUTH_STORAGE_UNAVAILABLE);
      assert.equal(error.isAuthStorageUnavailable, true);
      assert.equal(error.operation, 'save');
      assert.equal(error.cause?.name, 'QuotaExceededError');
      return true;
    }
  );
  assert.equal(controller.isSessionReadBlocked(), true);
  assert.equal(controller.readSession(), null);
  assert.equal(session.peek('nav_profile_v2:user-3'), null);
}

// A later successful persistence explicitly restores session reads.
{
  const { local, controller } = newController();
  local.setFailure('set', (key) => key === 'nav_session_v2');
  assert.throws(
    () => controller.persistSession({ access_token: 'first-attempt' }),
    (error) => error.code === NAV_AUTH_STORAGE_UNAVAILABLE
  );
  assert.equal(controller.isSessionReadBlocked(), true);

  local.clearFailures();
  const session = {
    access_token: 'recovered-access',
    refresh_token: 'recovered-refresh',
    user: { id: 'recovered-user', email: 'recovered@example.test' }
  };
  assert.equal(controller.persistSession(session), session);
  assert.equal(controller.isSessionReadBlocked(), false);
  assert.equal(controller.readSession()?.access_token, 'recovered-access');
}

console.log('Navigator v2 Auth storage guard helper tests passed');
