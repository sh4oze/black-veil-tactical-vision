/**
 * Client-side access gate for BLACK VEIL.
 *
 * IMPORTANT — honest limitation: this application has no backend and no database
 * by design (see project requirements). This means authentication happens entirely
 * inside the user's own browser. No matter how it's implemented, anyone with access
 * to browser devtools can read the bundled JS, patch it, or simply flip application
 * state to bypass the check. This module is a deterrent against casual/opportunistic
 * access (e.g. someone picking up the laptop), NOT a security boundary against a
 * motivated attacker who already has local access to the machine running the app.
 * Real access control requires a server that verifies credentials and issues session
 * tokens the client cannot forge — out of scope while "no database for now" stands.
 *
 * Within that constraint, this still avoids the worst mistakes:
 *  - the password is never stored or compared in plaintext, only as a salted SHA-256
 *    digest (Web Crypto SubtleCrypto, not a hand-rolled hash)
 *  - failed attempts are rate-limited with exponential backoff, persisted across
 *    reloads, to slow down brute-force guessing
 *  - sessions are opaque random tokens with a hard expiry, kept in sessionStorage
 *    (cleared when the browser tab/window closes) rather than localStorage
 *  - no credential material, session token, or attempt counter is ever logged
 */

const AUTHORIZED_EMAIL = 'zanfaust@gmail.com';
const CREDENTIAL_SALT = '2b703be3020d4146b79f6894bf4ce523';
// SHA-256("<salt>:<email>:<password>") — see scripts/generate-auth-hash.md for regeneration steps.
const CREDENTIAL_HASH = '7056f89b0f1f85ae97ebd3f11da463243db020665bb6792ff84d60b8dfd5e5aa';

const SESSION_KEY = 'blackveil.session.v1';
const ATTEMPTS_KEY = 'blackveil.auth_attempts.v1';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8h
const MAX_FREE_ATTEMPTS = 5;
const LOCKOUT_BASE_MS = 15 * 1000;
const LOCKOUT_MAX_MS = 5 * 60 * 1000;

interface AttemptState {
  count: number;
  lockedUntil: number;
}

interface SessionState {
  token: string;
  expiresAt: number;
}

function readAttempts(): AttemptState {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    if (!raw) return { count: 0, lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    if (typeof parsed.count === 'number' && typeof parsed.lockedUntil === 'number') return parsed;
  } catch {
    // ignore corrupt state
  }
  return { count: 0, lockedUntil: 0 };
}

function writeAttempts(state: AttemptState): void {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode / quota) — fail open on rate-limit bookkeeping only
  }
}

function clearAttempts(): void {
  try {
    localStorage.removeItem(ATTEMPTS_KEY);
  } catch {
    // ignore
  }
}

export interface LockoutInfo {
  locked: boolean;
  remainingMs: number;
  attemptsUsed: number;
}

/** Checks lockout status without consuming an attempt. */
export function getLockoutStatus(): LockoutInfo {
  const state = readAttempts();
  const remainingMs = Math.max(0, state.lockedUntil - Date.now());
  return { locked: remainingMs > 0, remainingMs, attemptsUsed: state.count };
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type LoginResult = { ok: true } | { ok: false; reason: 'locked'; remainingMs: number } | { ok: false; reason: 'invalid'; attemptsRemaining: number };

export async function attemptLogin(emailInput: string, passwordInput: string): Promise<LoginResult> {
  const lockout = getLockoutStatus();
  if (lockout.locked) {
    return { ok: false, reason: 'locked', remainingMs: lockout.remainingMs };
  }

  const email = emailInput.trim().toLowerCase();
  const candidateHash = await sha256Hex(`${CREDENTIAL_SALT}:${email}:${passwordInput}`);
  const valid = email === AUTHORIZED_EMAIL && timingSafeEqual(candidateHash, CREDENTIAL_HASH);

  if (valid) {
    clearAttempts();
    createSession();
    return { ok: true };
  }

  const state = readAttempts();
  const nextCount = state.count + 1;
  let lockedUntil = 0;
  if (nextCount >= MAX_FREE_ATTEMPTS) {
    const overflow = nextCount - MAX_FREE_ATTEMPTS;
    const duration = Math.min(LOCKOUT_MAX_MS, LOCKOUT_BASE_MS * 2 ** overflow);
    lockedUntil = Date.now() + duration;
  }
  writeAttempts({ count: nextCount, lockedUntil });

  if (lockedUntil > 0) {
    return { ok: false, reason: 'locked', remainingMs: lockedUntil - Date.now() };
  }
  return { ok: false, reason: 'invalid', attemptsRemaining: Math.max(0, MAX_FREE_ATTEMPTS - nextCount) };
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function createSession(): void {
  const session: SessionState = { token: randomToken(), expiresAt: Date.now() + SESSION_DURATION_MS };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore — worst case the user is asked to log in again
  }
}

export function hasValidSession(): boolean {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const session: SessionState = JSON.parse(raw);
    if (typeof session.expiresAt !== 'number' || Date.now() > session.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function logout(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
