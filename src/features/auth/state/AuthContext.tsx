import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/shared/lib/supabase/client';
import { Profile, UserRole } from '@/shared/types';

export type AuthState = 'bootstrapping' | 'authenticated' | 'unauthenticated' | 'profile_error';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  authState: AuthState;
  profileError: string | null;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  retryProfileLoad: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_PROFILE: Profile = {
  id: 'demo-admin',
  organization_id: 'demo-org',
  email: 'admin@flowly.io',
  full_name: 'Demo Admin',
  role: UserRole.ADMIN,
  avatar_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const PROFILE_RETRY_BACKOFF_MS = [300, 800, 1500] as const;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage;
    }
  }

  return String(error);
}

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === 'string') {
      return maybeCode;
    }
  }
  return '';
}

function getErrorStatus(error: unknown) {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const maybeStatus = Number((error as { status?: unknown }).status);
    if (Number.isFinite(maybeStatus)) {
      return maybeStatus;
    }
  }
  return null;
}

function isTransientProfileError(error: unknown) {
  const status = getErrorStatus(error);
  if (status && [408, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return /network|fetch|timeout|temporar|gateway|503|502|504|connection|rate limit|abort/.test(message);
}

interface ProfileLoadResult {
  profile: Profile | null;
  error: string | null;
  transientFailure: boolean;
}

export const AuthProvider = ({ children }: { children?: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<AuthState>('bootstrapping');
  const [profileError, setProfileError] = useState<string | null>(null);
  const requestTokenRef = useRef(0);
  const lastKnownProfileRef = useRef<Profile | null>(null);

  const debugLog = useCallback((message: string, payload?: unknown) => {
    if (!(import.meta as any).env?.DEV) {
      return;
    }

    if (payload !== undefined) {
      console.debug(`[auth] ${message}`, payload);
      return;
    }

    console.debug(`[auth] ${message}`);
  }, []);

  const fetchProfileWithRetry = useCallback(async (userId: string): Promise<ProfileLoadResult> => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= PROFILE_RETRY_BACKOFF_MS.length; attempt += 1) {
      const attemptNo = attempt + 1;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          const profileNotFound = new Error('Profile not found');
          (profileNotFound as Error & { code?: string }).code = 'PROFILE_NOT_FOUND';
          throw profileNotFound;
        }

        return {
          profile: data as Profile,
          error: null,
          transientFailure: false,
        };
      } catch (error) {
        lastError = error;
        const transientFailure = isTransientProfileError(error);
        const shouldRetry = transientFailure && attempt < PROFILE_RETRY_BACKOFF_MS.length;

        debugLog(`profile load failed (attempt ${attemptNo})`, {
          transientFailure,
          message: getErrorMessage(error),
          code: getErrorCode(error),
          status: getErrorStatus(error),
        });

        if (shouldRetry) {
          await wait(PROFILE_RETRY_BACKOFF_MS[attempt]);
          continue;
        }

        return {
          profile: null,
          error: getErrorMessage(error),
          transientFailure,
        };
      }
    }

    return {
      profile: null,
      error: lastError ? getErrorMessage(lastError) : 'Unknown profile loading error',
      transientFailure: false,
    };
  }, [debugLog]);

  const resolveAuthState = useCallback(async (nextSession: Session | null, source: 'bootstrap' | 'auth_event' | 'retry') => {
    const token = ++requestTokenRef.current;
    setLoading(true);
    setAuthState('bootstrapping');
    setProfileError(null);
    setSession(nextSession);
    debugLog(`auth state -> bootstrapping (${source})`);

    if (!nextSession) {
      if (token !== requestTokenRef.current) return;

      setProfile(null);
      lastKnownProfileRef.current = null;
      setAuthState('unauthenticated');
      setLoading(false);
      debugLog('auth state -> unauthenticated');
      return;
    }

    const result = await fetchProfileWithRetry(nextSession.user.id);
    if (token !== requestTokenRef.current) return;

    if (result.profile) {
      setProfile(result.profile);
      lastKnownProfileRef.current = result.profile;
      setProfileError(null);
      setAuthState('authenticated');
      setLoading(false);
      debugLog('auth state -> authenticated');
      return;
    }

    if (result.transientFailure && lastKnownProfileRef.current) {
      setProfile(lastKnownProfileRef.current);
      setProfileError(result.error ?? 'Temporary profile loading issue');
      setAuthState('authenticated');
      setLoading(false);
      debugLog('auth state -> authenticated (cached profile after transient failure)');
      return;
    }

    setProfile(null);
    setProfileError(result.error ?? 'Could not load profile');
    setAuthState('profile_error');
    setLoading(false);
    debugLog('auth state -> profile_error', result.error);
  }, [debugLog, fetchProfileWithRetry]);

  const refreshProfile = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setProfile(DEMO_PROFILE);
      setProfileError(null);
      setAuthState('authenticated');
      setLoading(false);
      lastKnownProfileRef.current = DEMO_PROFILE;
      return;
    }

    await resolveAuthState(session ?? null, 'retry');
  };

  const retryProfileLoad = async () => {
    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    const { data } = await supabase.auth.getSession();
    await resolveAuthState(data.session ?? null, 'retry');
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setSession(null);
      setProfile(DEMO_PROFILE);
      lastKnownProfileRef.current = DEMO_PROFILE;
      setProfileError(null);
      setAuthState('authenticated');
      setLoading(false);
      debugLog('auth state -> authenticated (demo mode)');
      return;
    }

    let active = true;

    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        await resolveAuthState(data.session ?? null, 'bootstrap');
      } catch (error) {
        if (!active) return;
        setProfile(null);
        setProfileError(getErrorMessage(error));
        setAuthState('profile_error');
        setLoading(false);
        debugLog('bootstrap failed', error);
      }
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      void resolveAuthState(nextSession ?? null, 'auth_event');
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [debugLog, resolveAuthState]);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured || !supabase) {
      const demoProfile = {
        ...DEMO_PROFILE,
        email,
      };
      setProfile(demoProfile);
      lastKnownProfileRef.current = demoProfile;
      setProfileError(null);
      setAuthState('authenticated');
      setLoading(false);
      return {};
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error.message };
    }

    return {};
  };

  const signOut = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setProfile(DEMO_PROFILE);
      setProfileError(null);
      setAuthState('authenticated');
      setLoading(false);
      lastKnownProfileRef.current = DEMO_PROFILE;
      return;
    }

    await supabase.auth.signOut();
  };

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      authState,
      profileError,
      isConfigured: isSupabaseConfigured,
      signIn,
      signOut,
      refreshProfile,
      retryProfileLoad,
    }),
    [session, profile, loading, authState, profileError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
