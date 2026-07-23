import assert from 'node:assert/strict';

import {
  NAV_AUTH_STORAGE_UNAVAILABLE,
  createAuthStorageController
} from '../../assets/js/nav-v2/auth-storage-guard-v2.js';

// A browser that denies the storage objects themselves remains fail-closed.
{
  const controller = createAuthStorageController({ local: null, session: null });

  assert.equal(controller.readSession(), null);
  assert.equal(controller.readLastEmail(), '');
  assert.equal(controller.readProfile('nav_profile_v2:user'), null);
  assert.equal(controller.rememberEmail('user@example.test'), false);
  assert.equal(controller.saveProfile('nav_profile_v2:user', { role: 'spn' }), false);
  assert.equal(controller.clearProfiles(), 0);

  const cleared = controller.clearSession({ email: 'user@example.test' });
  assert.equal(cleared.persistentClearSucceeded, false);
  assert.equal(cleared.sessionReadBlocked, true);
  assert.equal(cleared.removeError?.name, 'SecurityError');
  assert.equal(controller.readSession(), null);

  assert.throws(
    () => controller.persistSession({ access_token: 'synthetic-access' }),
    (error) => {
      assert.equal(error.code, NAV_AUTH_STORAGE_UNAVAILABLE);
      assert.equal(error.isAuthStorageUnavailable, true);
      assert.equal(error.operation, 'save');
      assert.equal(error.cause?.name, 'SecurityError');
      return true;
    }
  );
  assert.equal(controller.isSessionReadBlocked(), true);
}

// A denied convenience read never blocks rendering the login form.
{
  const local = {
    getItem() {
      const error = new Error('Synthetic read denial');
      error.name = 'SecurityError';
      throw error;
    }
  };
  const controller = createAuthStorageController({ local, session: null });
  assert.equal(controller.readLastEmail(), '');
  assert.equal(controller.readSession(), null);
}

console.log('Navigator v2 unavailable browser storage object tests passed');
