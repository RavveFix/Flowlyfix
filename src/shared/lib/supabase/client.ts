import { createClient } from '@supabase/supabase-js';
import { runtimeConfig } from '@/shared/config/runtime';

// Safely access environment variables.
// In Vite, import.meta.env is defined. In other environments, it might be undefined.
const env = (import.meta as any).env || {};
export const runtimeAuthMode = runtimeConfig.runtimeAuthMode;

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
const supabaseHost = (() => {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return null;
  }
})();
const authStorageKey = supabaseHost ? `flowly-auth-${supabaseHost}` : 'flowly-auth';

function extractAccessTokenFromStoredSession(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (typeof parsed.access_token === 'string') {
      return parsed.access_token;
    }

    const currentSession = parsed.currentSession as Record<string, unknown> | undefined;
    if (currentSession && typeof currentSession.access_token === 'string') {
      return currentSession.access_token;
    }

    const session = parsed.session as Record<string, unknown> | undefined;
    if (session && typeof session.access_token === 'string') {
      return session.access_token;
    }

    return null;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function cleanupSupabaseAuthStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return;

  const migrationFlag = 'flowly-auth-cleanup-v3';
  if (window.localStorage.getItem(migrationFlag) === 'done') return;

  const expectedIssHost = supabaseHost ?? '';
  const keysToDelete = new Set<string>();
  const pushCandidate = (key: string) => {
    const isLegacySupabaseAuthKey = /^sb-.*-auth-token$/.test(key);
    const isFlowlyAuthKey = key.startsWith('flowly-auth');
    if (isLegacySupabaseAuthKey || isFlowlyAuthKey) {
      keysToDelete.add(key);
    }
  };

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    pushCandidate(key);
  }
  try {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (!key) continue;
      pushCandidate(key);
    }
  } catch {
    // ignore sessionStorage access errors
  }

  if (keysToDelete.has(authStorageKey)) {
    const raw = window.localStorage.getItem(authStorageKey);
    const sessionRaw = (() => {
      try {
        return window.sessionStorage?.getItem(authStorageKey) ?? null;
      } catch {
        return null;
      }
    })();
    const source = raw ?? sessionRaw;

    // Keep the current auth storage key when it points to this Supabase project.
    if (source) {
      const token = extractAccessTokenFromStoredSession(source);
      if (token) {
        const payload = decodeJwtPayload(token);
        const iss = typeof payload?.iss === 'string' ? payload.iss : '';
        if (iss.includes(expectedIssHost)) {
          keysToDelete.delete(authStorageKey);
        }
      }
    }
  }

  for (const key of Array.from(keysToDelete)) {
    window.localStorage.removeItem(key);
    try {
      window.sessionStorage?.removeItem(key);
    } catch {
      // ignore sessionStorage access errors
    }
  }

  window.localStorage.setItem(migrationFlag, 'done');
}

if (runtimeAuthMode === 'supabase') {
  cleanupSupabaseAuthStorage();
}

export const supabase = (runtimeAuthMode === 'supabase' && supabaseUrl && supabaseAnonKey)
  ? (() => {
      const globalRef = globalThis as typeof globalThis & { __flowlySupabaseClient?: unknown };
      if (globalRef.__flowlySupabaseClient) {
        return globalRef.__flowlySupabaseClient as ReturnType<typeof createClient>;
      }

      const client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: authStorageKey,
        },
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });

      globalRef.__flowlySupabaseClient = client;
      return client;
    })()
  : null;

export const isSupabaseConfigured = runtimeAuthMode === 'supabase' && !!supabase;

export function assertSupabaseConfigured() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}
