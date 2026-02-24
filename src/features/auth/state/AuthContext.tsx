import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, runtimeAuthMode, supabase } from '@/shared/lib/supabase/client';
import type { RuntimeAuthMode } from '@/shared/config/runtime';
import { Profile, UserRole, UserStatus } from '@/shared/types';

export type AuthState = 'bootstrapping' | 'authenticated' | 'unauthenticated' | 'profile_error';

interface AuthEventDebug {
  event: string;
  at: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  authState: AuthState;
  profileError: string | null;
  isConfigured: boolean;
  runtimeAuthMode: RuntimeAuthMode;
  authEventDebug?: AuthEventDebug | null;
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
  status: UserStatus.ACTIVE,
  avatar_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const PROFILE_RETRY_BACKOFF_MS = [300, 800, 1500] as const;
const SESSION_RECOVERY_BACKOFF_MS = [150, 500, 1200, 2500] as const;

interface ProfileLoadResult {
  profile: Profile | null;
  error: string | null;
  transientFailure: boolean;
}

interface ApplySessionOptions {
  source: string;
  showBoot?: boolean;
  allowNullSessionRecovery?: boolean;
  eventName?: string;
}

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

export const AuthProvider = ({ children }: { children?: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<AuthState>('bootstrapping');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [authEventDebug, setAuthEventDebug] = useState<AuthEventDebug | null>(null);

  const requestTokenRef = useRef(0);
  const lastKnownProfileRef = useRef<Profile | null>(null);
  const initializedRef = useRef(false);
  const authStateRef = useRef<AuthState>('bootstrapping');

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

  const markAuthEvent = useCallback((eventName: string) => {
    if (!(import.meta as any).env?.DEV) {
      return;
    }

    setAuthEventDebug({
      event: eventName,
      at: new Date().toISOString(),
    });
  }, []);

  const fetchProfileWithRetry = useCallback(async (userId: string): Promise<ProfileLoadResult> => {
    let lastError: unknown = null;

    if (!supabase) {
      return {
        profile: null,
        error: 'Supabase client unavailable',
        transientFailure: false,
      };
    }

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

  const recoverSessionWithRetry = useCallback(async () => {
    if (!supabase) {
      return null;
    }

    for (let attempt = 0; attempt <= SESSION_RECOVERY_BACKOFF_MS.length; attempt += 1) {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (data.session) {
          debugLog('session recovered after transient null session');
          return data.session;
        }
      } catch (error) {
        debugLog(`session recovery attempt ${attempt + 1} failed`, {
          message: getErrorMessage(error),
          code: getErrorCode(error),
          status: getErrorStatus(error),
        });
      }

      if (attempt < SESSION_RECOVERY_BACKOFF_MS.length) {
        await wait(SESSION_RECOVERY_BACKOFF_MS[attempt]);
      }
    }

    return null;
  }, [debugLog]);

  const applySession = useCallback(async (nextSession: Session | null, options: ApplySessionOptions) => {
    const token = ++requestTokenRef.current;
    const shouldBoot = options.showBoot ?? false;
    const allowRecovery = options.allowNullSessionRecovery ?? false;

    if (options.eventName) {
      markAuthEvent(options.eventName);
    }

    if (shouldBoot) {
      setLoading(true);
      setAuthState('bootstrapping');
    }

    if (nextSession) {
      setProfileError(null);
    }

    if (nextSession || !allowRecovery) {
      setSession(nextSession);
    }

    let resolvedSession = nextSession;

    if (!resolvedSession && allowRecovery) {
      const recoveredSession = await recoverSessionWithRetry();
      if (token !== requestTokenRef.current) return;

      if (recoveredSession) {
        resolvedSession = recoveredSession;
        setSession(recoveredSession);
      }
    }

    debugLog(`applySession(${options.source})`, {
      hasSession: !!resolvedSession,
      shouldBoot,
      allowRecovery,
      event: options.eventName ?? null,
    });

    if (!resolvedSession) {
      if (token !== requestTokenRef.current) return;

      if (allowRecovery && authStateRef.current === 'authenticated' && lastKnownProfileRef.current) {
        setProfile(lastKnownProfileRef.current);
        setProfileError('Temporary session recovery issue');
        setAuthState('authenticated');
        setLoading(false);
        debugLog('auth state -> authenticated (cached profile after null session)');
        return;
      }

      setSession(null);
      setProfile(null);
      lastKnownProfileRef.current = null;
      setProfileError(null);
      setAuthState('unauthenticated');
      setLoading(false);
      debugLog('auth state -> unauthenticated');
      return;
    }

    const result = await fetchProfileWithRetry(resolvedSession.user.id);
    if (token !== requestTokenRef.current) return;

    if (result.profile) {
      if (result.profile.status === UserStatus.INACTIVE) {
        setProfile(null);
        lastKnownProfileRef.current = null;
        setProfileError('Your account is deactivated. Contact your administrator.');
        setAuthState('unauthenticated');
        setLoading(false);
        debugLog('auth state -> unauthenticated (inactive profile)');
        if (supabase) {
          void supabase.auth.signOut();
        }
        return;
      }

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
  }, [debugLog, fetchProfileWithRetry, markAuthEvent, recoverSessionWithRetry]);

  const refreshProfile = async () => {
    if (runtimeAuthMode === 'demo') {
      setSession(null);
      setProfile(DEMO_PROFILE);
      setProfileError(null);
      setAuthState('authenticated');
      setLoading(false);
      lastKnownProfileRef.current = DEMO_PROFILE;
      return;
    }

    if (runtimeAuthMode !== 'supabase' || !supabase) {
      setSession(null);
      setProfile(null);
      setProfileError('Missing auth configuration');
      setAuthState('unauthenticated');
      setLoading(false);
      return;
    }

    const { data } = await supabase.auth.getSession();
    await applySession(data.session ?? null, {
      source: 'refresh_profile',
      showBoot: false,
      allowNullSessionRecovery: true,
      eventName: 'MANUAL_REFRESH',
    });
  };

  const retryProfileLoad = async () => {
    if (runtimeAuthMode !== 'supabase' || !supabase) {
      return;
    }

    const { data } = await supabase.auth.getSession();
    await applySession(data.session ?? null, {
      source: 'retry_profile',
      showBoot: false,
      allowNullSessionRecovery: true,
      eventName: 'RETRY_PROFILE_LOAD',
    });
  };

  useEffect(() => {
    authStateRef.current = authState;
  }, [authState]);

  useEffect(() => {
    initializedRef.current = false;
    requestTokenRef.current += 1;

    if (runtimeAuthMode === 'demo') {
      setSession(null);
      setProfile(DEMO_PROFILE);
      lastKnownProfileRef.current = DEMO_PROFILE;
      setProfileError(null);
      setAuthState('authenticated');
      setLoading(false);
      debugLog('auth state -> authenticated (demo mode)');
      return;
    }

    if (runtimeAuthMode !== 'supabase' || !supabase) {
      setSession(null);
      setProfile(null);
      lastKnownProfileRef.current = null;
      setProfileError('Missing auth configuration');
      setAuthState('unauthenticated');
      setLoading(false);
      debugLog('auth state -> unauthenticated (misconfigured mode)');
      return;
    }

    let active = true;
    setLoading(true);
    setAuthState('bootstrapping');

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession) => {
      if (!active) return;

      const hasStableProfile = !!lastKnownProfileRef.current;
      markAuthEvent(event);

      if (event === 'INITIAL_SESSION') {
        if (initializedRef.current) {
          debugLog('ignoring duplicate INITIAL_SESSION event');
          return;
        }

        initializedRef.current = true;
        void applySession(nextSession ?? null, {
          source: 'initial_session',
          showBoot: true,
          allowNullSessionRecovery: true,
          eventName: event,
        });
        return;
      }

      if (!initializedRef.current) {
        initializedRef.current = true;
      }

      if (event === 'SIGNED_OUT') {
        void applySession(null, {
          source: 'signed_out',
          showBoot: false,
          allowNullSessionRecovery: false,
          eventName: event,
        });
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        setSession(nextSession ?? null);

        if (nextSession && lastKnownProfileRef.current?.id === nextSession.user.id) {
          debugLog('token refreshed without profile reload');
          return;
        }

        void applySession(nextSession ?? null, {
          source: 'token_refreshed',
          showBoot: false,
          allowNullSessionRecovery: true,
          eventName: event,
        });
        return;
      }

      if (event === 'SIGNED_IN') {
        void applySession(nextSession ?? null, {
          source: 'signed_in',
          showBoot: !hasStableProfile,
          allowNullSessionRecovery: true,
          eventName: event,
        });
        return;
      }

      if (event === 'USER_UPDATED') {
        void applySession(nextSession ?? null, {
          source: 'user_updated',
          showBoot: false,
          allowNullSessionRecovery: true,
          eventName: event,
        });
        return;
      }

      void applySession(nextSession ?? null, {
        source: `auth_event_${String(event).toLowerCase()}`,
        showBoot: !hasStableProfile,
        allowNullSessionRecovery: true,
        eventName: event,
      });
    });

    const fallbackTimer = setTimeout(async () => {
      if (!active || initializedRef.current || !supabase) {
        return;
      }

      initializedRef.current = true;

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;

        if (error) {
          throw error;
        }

        await applySession(data.session ?? null, {
          source: 'bootstrap_fallback',
          showBoot: true,
          allowNullSessionRecovery: true,
          eventName: 'BOOTSTRAP_FALLBACK',
        });
      } catch (error) {
        if (!active) return;
        setProfile(null);
        lastKnownProfileRef.current = null;
        setProfileError(getErrorMessage(error));
        setAuthState('profile_error');
        setLoading(false);
        debugLog('bootstrap fallback failed', error);
      }
    }, 1500);

    return () => {
      active = false;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [applySession, debugLog, markAuthEvent]);

  const signIn = async (email: string, password: string) => {
    if (runtimeAuthMode === 'demo') {
      const demoProfile = {
        ...DEMO_PROFILE,
        email,
      };
      setSession(null);
      setProfile(demoProfile);
      lastKnownProfileRef.current = demoProfile;
      setProfileError(null);
      setAuthState('authenticated');
      setLoading(false);
      return {};
    }

    if (runtimeAuthMode !== 'supabase' || !supabase) {
      return { error: 'Auth configuration missing. Set Supabase env vars or enable VITE_DEMO_MODE=true.' };
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: error.message };
    }

    return {};
  };

  const signOut = async () => {
    if (runtimeAuthMode === 'demo') {
      setSession(null);
      setProfile(null);
      lastKnownProfileRef.current = null;
      setProfileError(null);
      setAuthState('unauthenticated');
      setLoading(false);
      return;
    }

    if (runtimeAuthMode !== 'supabase' || !supabase) {
      setSession(null);
      setProfile(null);
      lastKnownProfileRef.current = null;
      setProfileError(null);
      setAuthState('unauthenticated');
      setLoading(false);
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
      runtimeAuthMode,
      authEventDebug,
      signIn,
      signOut,
      refreshProfile,
      retryProfileLoad,
    }),
    [session, profile, loading, authState, profileError, authEventDebug, signIn, signOut, refreshProfile, retryProfileLoad],
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
