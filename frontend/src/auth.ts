import { useSyncExternalStore } from 'react';

export type SessionUser = { id: string; email: string; role: 'ADMIN' | 'USER' };
export type Session = { token: string | null; user: SessionUser | null };

const TOKEN_KEY = 'lr_token';
const USER_KEY = 'lr_user';

// ---------------------------------------------------------------
// A tiny store so every part of the app (axios interceptor included) can
// invalidate the session and have React re-render. Without this, a 401 from
// a background query would empty localStorage while App still believed the
// user was signed in.
// ---------------------------------------------------------------
const listeners = new Set<() => void>();
let cache: Session | null = null;

function snapshot(): Session {
  if (!cache) {
    let user: SessionUser | null = null;
    try {
      const raw = localStorage.getItem(USER_KEY);
      user = raw ? (JSON.parse(raw) as SessionUser) : null;
    } catch {
      user = null;
    }
    cache = { token: localStorage.getItem(TOKEN_KEY), user };
  }
  return cache;
}

function commit() {
  cache = null;
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Re-renders on login/logout/expiry. */
export function useSession(): Session {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export const getToken = () => snapshot().token;
export const getUser = () => snapshot().user;
export const isAdmin = () => snapshot().user?.role === 'ADMIN';

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  commit();
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  commit();
}

/** "admin@league.local" → "AD" */
export function initials(email: string): string {
  const parts = email.split('@')[0].split(/[._\-+\s]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0] ?? '');
  return letters.join('').toUpperCase() || '?';
}
