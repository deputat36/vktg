export const NAV_AUTH_SESSION_EXPIRED = 'NAV_AUTH_SESSION_EXPIRED';

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
