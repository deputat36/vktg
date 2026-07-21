export const NAV_AUTH_SESSION_EXPIRED = 'NAV_AUTH_SESSION_EXPIRED';
export const NAV_AUTH_REFRESH_LOCK_NAME = 'navigator-v2-auth-refresh';

const INVALID_REFRESH_PATTERNS = [
  'refresh_token_not_found',
  'refresh token not found',
  'invalid refresh token',
  'refresh_token_already_used',
  'refresh token already used',
  'refresh token has already been used',
  'refresh token is invalid'
];

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function tokenValue(session, key) {
  return String(session?.[key] || '');
}

export function authErrorFingerprint(error) {
  return [
    error?.code,
    error?.error_code,
    error?.message,
    error?.payload?.error_code,
    error?.payload?.error,
    error?.payload?.message,
    error?.payload?.msg,
    error?.payload?.error_description
  ]
    .map(normalize)
    .filter(Boolean)
    .join(' | ');
}

export function classifyAuthSessionError(error) {
  if (error?.code === NAV_AUTH_SESSION_EXPIRED || error?.isAuthSessionExpired === true) {
    return 'session_expired';
  }

  const fingerprint = authErrorFingerprint(error);
  if (INVALID_REFRESH_PATTERNS.some((pattern) => fingerprint.includes(pattern))) {
    return 'invalid_refresh_token';
  }

  if (
    fingerprint.includes('jwt expired') ||
    fingerprint.includes('token is expired') ||
    fingerprint.includes('invalid jwt')
  ) {
    return 'expired_access_token';
  }

  return 'other';
}

export function shouldInvalidateSessionAfterRefreshFailure(error) {
  return classifyAuthSessionError(error) === 'invalid_refresh_token';
}

export function isSameAuthSession(currentSession, attemptedSession) {
  const attemptedAccessToken = tokenValue(attemptedSession, 'access_token');
  const currentAccessToken = tokenValue(currentSession, 'access_token');
  if (!attemptedAccessToken || !currentAccessToken || attemptedAccessToken !== currentAccessToken) {
    return false;
  }

  const attemptedRefreshToken = tokenValue(attemptedSession, 'refresh_token');
  const currentRefreshToken = tokenValue(currentSession, 'refresh_token');
  return attemptedRefreshToken === currentRefreshToken;
}

export function isReplacementAuthSession(currentSession, attemptedSession) {
  return Boolean(currentSession?.access_token) && !isSameAuthSession(currentSession, attemptedSession);
}

export function hasSessionAdvancedSinceRequest(currentSession, failedAccessToken) {
  const currentAccessToken = tokenValue(currentSession, 'access_token');
  const failedToken = String(failedAccessToken || '');
  return Boolean(currentAccessToken && failedToken && currentAccessToken !== failedToken);
}

export function createAuthSessionExpiredError(cause = null) {
  const error = new Error('Сессия истекла или была отозвана. Выполните вход заново — старые данные входа уже очищены.');
  error.name = 'NavigatorAuthSessionExpiredError';
  error.code = NAV_AUTH_SESSION_EXPIRED;
  error.isAuthSessionExpired = true;
  if (cause) error.cause = cause;
  return error;
}

export function isAuthSessionExpiredError(error) {
  return classifyAuthSessionError(error) === 'session_expired';
}
