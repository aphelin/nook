import type { CookieOptions, Response } from 'express';
import type { IssuedRefresh } from './tokens.service.js';

/** httpOnly refresh token, scoped to the auth routes only. */
export const REFRESH_COOKIE = 'nook_rt';
/**
 * Readable, non-secret hint that a session exists, scoped site-wide.
 * The Next.js proxy uses it to redirect signed-out visitors before rendering; it grants nothing.
 */
export const SESSION_HINT_COOKIE = 'nook_session';

const REFRESH_PATH = '/api/auth';

export function setSessionCookies(res: Response, refresh: IssuedRefresh, secure: boolean) {
  const base: CookieOptions = { sameSite: 'lax', secure, expires: refresh.expiresAt };
  res.cookie(REFRESH_COOKIE, refresh.token, { ...base, httpOnly: true, path: REFRESH_PATH });
  res.cookie(SESSION_HINT_COOKIE, '1', { ...base, httpOnly: false, path: '/' });
}

export function clearSessionCookies(res: Response, secure: boolean) {
  res.clearCookie(REFRESH_COOKIE, { sameSite: 'lax', secure, httpOnly: true, path: REFRESH_PATH });
  res.clearCookie(SESSION_HINT_COOKIE, { sameSite: 'lax', secure, path: '/' });
}
