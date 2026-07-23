import assert from 'node:assert/strict';

import { createAuthStorageController } from '../../assets/js/nav-v2/auth-storage-guard-v2.js';

class MemoryStorage {
  constructor() {
    Object.defineProperty(this, '_values', { value: new Map(), enumerable: false });
    Object.defineProperty(this, '_failSet', { value: false, writable: true, enumerable: false });
    Object.defineProperty(this, '_failRemove', { value: false, writable: true, enumerable: false });
  }

  getItem(key) {
    return this._values.has(String(key)) ? this._values.get(String(key)) : null;
  }

  setItem(key, value) {
    if (this._failSet) {
      const error = new Error('Synthetic set failure');
      error.name = 'QuotaExceededError';
      throw error;
    }
    const normalized = String(key);
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
    if (this._failRemove) {
      const error = new Error('Synthetic remove failure');
      error.name = 'SecurityError';
      throw error;
    }
    const normalized = String(key);
    this._values.delete(normalized);
    delete this[normalized];
  }
}

// A failed persist blocks only the exact stale stored value. A newer session
// written by another tab must automatically resume reads in this page.
{
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const controller = createAuthStorageController({ local, session });

  const stale = {
    access_token: 'fingerprint-stale-access',
    refresh_token: 'fingerprint-stale-refresh',
    user: { id: 'fingerprint-user', email: 'fingerprint@example.test' }
  };
  local.setItem('nav_session_v2', JSON.stringify(stale));
  local._failSet = true;

  assert.throws(
    () => controller.persistSession({ ...stale, access_token: 'failed-new-access' }),
    (error) => error.code === 'NAV_AUTH_STORAGE_UNAVAILABLE'
  );
  assert.equal(controller.isSessionReadBlocked(), true);
  assert.equal(controller.readSession(), null, 'unchanged stale fingerprint must remain blocked');

  local._failSet = false;
  const replacement = {
    ...stale,
    access_token: 'fingerprint-replacement-access',
    refresh_token: 'fingerprint-replacement-refresh'
  };
  local.setItem('nav_session_v2', JSON.stringify(replacement));

  assert.equal(
    controller.readSession()?.access_token,
    replacement.access_token,
    'different cross-tab session fingerprint must be accepted'
  );
  assert.equal(controller.isSessionReadBlocked(), false);
}

// A failed double-clear blocks the exact stale value, but a later clean sign-in
// written outside the controller must not require reloading the page.
{
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  const controller = createAuthStorageController({ local, session });

  local.setItem('nav_session_v2', JSON.stringify({ access_token: 'clear-stale-access' }));
  local._failRemove = true;
  local._failSet = true;

  const result = controller.clearSession();
  assert.equal(result.persistentClearSucceeded, false);
  assert.equal(controller.readSession(), null);

  local._failRemove = false;
  local._failSet = false;
  local.setItem('nav_session_v2', JSON.stringify({ access_token: 'external-clean-signin' }));

  assert.equal(controller.readSession()?.access_token, 'external-clean-signin');
  assert.equal(controller.isSessionReadBlocked(), false);
}

console.log('Navigator v2 Auth storage fingerprint recovery tests passed');
