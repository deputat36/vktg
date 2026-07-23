export const NAV_AUTH_STORAGE_UNAVAILABLE = 'NAV_AUTH_STORAGE_UNAVAILABLE';

export function createAuthStorageUnavailableError(operation = 'save', cause = null) {
  const error = new Error(
    operation === 'clear'
      ? 'Не удалось надёжно очистить данные входа в браузере. Обновите страницу и войдите заново.'
      : 'Браузер не разрешил сохранить данные входа. Проверьте настройки приватности или свободное место и повторите вход.'
  );
  error.code = NAV_AUTH_STORAGE_UNAVAILABLE;
  error.isAuthStorageUnavailable = true;
  error.operation = operation;
  if (cause) error.cause = cause;
  return error;
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch (_) {
    return null;
  }
}

export function createAuthStorageController({
  local,
  session,
  sessionKey = 'nav_session_v2',
  profilePrefix = 'nav_profile_v2:',
  lastEmailKey = 'nav_last_email_v2'
} = {}) {
  let sessionReadBlocked = false;

  function readSession() {
    if (sessionReadBlocked) return null;
    try {
      return parseJson(local?.getItem(sessionKey));
    } catch (_) {
      return null;
    }
  }

  function readProfile(cacheKey) {
    try {
      return parseJson(session?.getItem(cacheKey));
    } catch (_) {
      return null;
    }
  }

  function clearProfiles() {
    let cleared = 0;
    try {
      const keys = Object.keys(session || {}).filter((key) => key.startsWith(profilePrefix));
      for (const key of keys) {
        try {
          session.removeItem(key);
          cleared += 1;
        } catch (_) {
          // Profile cache is optional. Continue clearing the remaining keys.
        }
      }
    } catch (_) {
      // Storage enumeration may be denied. Session authorization remains blocked.
    }
    return cleared;
  }

  function rememberEmail(email) {
    const clean = String(email || '').trim();
    if (!clean) return false;
    try {
      local?.setItem(lastEmailKey, clean);
      return true;
    } catch (_) {
      return false;
    }
  }

  function saveProfile(cacheKey, profile) {
    if (!cacheKey || !profile?.role) return false;
    try {
      session?.setItem(cacheKey, JSON.stringify({ ...profile, cached_at: Date.now() }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearSession({ email = '' } = {}) {
    sessionReadBlocked = true;
    let persistentClearSucceeded = false;
    let removeError = null;

    try {
      local?.removeItem(sessionKey);
      persistentClearSucceeded = true;
    } catch (error) {
      removeError = error;
      try {
        local?.setItem(sessionKey, 'null');
        persistentClearSucceeded = true;
      } catch (_) {
        persistentClearSucceeded = false;
      }
    } finally {
      clearProfiles();
      rememberEmail(email);
    }

    return {
      persistentClearSucceeded,
      sessionReadBlocked: true,
      removeError
    };
  }

  function persistSession(nextSession) {
    if (!nextSession) return clearSession();

    let serialized;
    try {
      serialized = JSON.stringify(nextSession);
    } catch (error) {
      sessionReadBlocked = true;
      clearProfiles();
      throw createAuthStorageUnavailableError('save', error);
    }

    try {
      local?.setItem(sessionKey, serialized);
      sessionReadBlocked = false;
      return nextSession;
    } catch (error) {
      sessionReadBlocked = true;
      clearProfiles();
      throw createAuthStorageUnavailableError('save', error);
    }
  }

  function isSessionReadBlocked() {
    return sessionReadBlocked;
  }

  return {
    readSession,
    readProfile,
    saveProfile,
    clearProfiles,
    rememberEmail,
    clearSession,
    persistSession,
    isSessionReadBlocked
  };
}
