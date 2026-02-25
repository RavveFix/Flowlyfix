import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, runtimeAuthMode, supabase } from '@/shared/lib/supabase/client';
import { runtimeConfig, type RuntimeAuthMode } from '@/shared/config/runtime';
import { OrganizationMembership, Profile, UserRole, UserStatus } from '@/shared/types';

export type AuthState = 'bootstrapping' | 'authenticated' | 'unauthenticated' | 'profile_error';

interface AuthEventDebug {
  event: string;
  at: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  memberships: OrganizationMembership[];
  activeOrganizationId: string | null;
  activeRole: UserRole | null;
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
  switchActiveOrganization: (organizationId: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_PROFILE: Profile = {
  id: 'demo-admin',
  organization_id: 'demo-org',
  active_organization_id: 'demo-org',
  email: 'admin@flowly.io',
  full_name: 'Demo Admin',
  role: UserRole.ADMIN,
  status: UserStatus.ACTIVE,
  avatar_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const DEMO_MEMBERSHIPS: OrganizationMembership[] = [
  {
    id: 'demo-membership-1',
    user_id: 'demo-admin',
    organization_id: 'demo-org',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    organization: {
      id: 'demo-org',
      name: 'Demo Organization',
      org_number: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  },
];

const PROFILE_RETRY_BACKOFF_MS = [300, 800, 1500] as const;
const SESSION_RECOVERY_BACKOFF_MS = [150, 500, 1200, 2500] as const;

interface IdentityLoadResult {
  profile: Profile | null;
  memberships: OrganizationMembership[];
  activeOrganizationId: string | null;
  activeRole: UserRole | null;
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
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [authState, setAuthState] = useState<AuthState>('bootstrapping');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [authEventDebug, setAuthEventDebug] = useState<AuthEventDebug | null>(null);

  const requestTokenRef = useRef(0);
  const lastKnownProfileRef = useRef<Profile | null>(null);
  const initializedRef = useRef(false);
  const authStateRef = useRef<AuthState>('bootstrapping');

  const debugLog = useCallback((message: string, payload?: unknown) => {
    if (!(import.meta as any).env?.DEV || !runtimeConfig.authDebugEnabled) {
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

  const fetchIdentityWithRetry = useCallback(async (userId: string): Promise<IdentityLoadResult> => {
    let lastError: unknown = null;

    if (!supabase) {
      return {
        profile: null,
        memberships: [],
        activeOrganizationId: null,
        activeRole: null,
        error: 'Supabase client unavailable',
        transientFailure: false,
      };
    }

    for (let attempt = 0; attempt <= PROFILE_RETRY_BACKOFF_MS.length; attempt += 1) {
      try {
        const [profileRes, membershipsRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabase
            .from('organization_memberships')
            .select('id, user_id, organization_id, role, status, is_default, created_at, updated_at, organization:organizations(*)')
            .eq('user_id', userId)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: true }),
        ]);

        if (profileRes.error) {
          throw profileRes.error;
        }

        if (!profileRes.data) {
          throw new Error('Profile not found');
        }

        const profileData = profileRes.data as Profile;
        const buildLegacyIdentity = (reason: string): IdentityLoadResult | null => {
          const legacyOrganizationId =
            (profileData.active_organization_id as string | null | undefined) ??
            (profileData.organization_id as string | null | undefined) ??
            null;
          const legacyRole = (profileData.role as UserRole | null | undefined) ?? null;
          const legacyStatus = (profileData.status as UserStatus | null | undefined) ?? null;

          if (!legacyOrganizationId || !legacyRole || legacyStatus !== UserStatus.ACTIVE) {
            return null;
          }

          const now = new Date().toISOString();
          const legacyMembership: OrganizationMembership = {
            id: `legacy-${userId}-${legacyOrganizationId}`,
            user_id: userId,
            organization_id: legacyOrganizationId,
            role: legacyRole,
            status: legacyStatus,
            is_default: true,
            created_at: profileData.created_at ?? now,
            updated_at: profileData.updated_at ?? now,
            organization: null,
          };

          const hydratedProfile: Profile = {
            ...profileData,
            organization_id: legacyOrganizationId,
            active_organization_id: legacyOrganizationId,
            role: legacyRole,
            status: legacyStatus,
          };

          debugLog('identity.legacy_fallback', {
            userId,
            reason,
            organizationId: legacyOrganizationId,
            role: legacyRole,
          });

          return {
            profile: hydratedProfile,
            memberships: [legacyMembership],
            activeOrganizationId: legacyOrganizationId,
            activeRole: legacyRole,
            error: null,
            transientFailure: false,
          };
        };

        if (membershipsRes.error) {
          const membershipErrorCode =
            typeof (membershipsRes.error as { code?: unknown }).code === 'string'
              ? ((membershipsRes.error as { code: string }).code ?? '')
              : '';
          const membershipErrorMessage = getErrorMessage(membershipsRes.error).toLowerCase();
          const missingMembershipRelation =
            membershipErrorCode === '42P01' ||
            (membershipErrorMessage.includes('organization_memberships') &&
              (membershipErrorMessage.includes('does not exist') || membershipErrorMessage.includes('undefined table')));

          if (missingMembershipRelation) {
            const legacyIdentity = buildLegacyIdentity('memberships_relation_missing');
            if (legacyIdentity) {
              return legacyIdentity;
            }
          }

          throw membershipsRes.error;
        }

        const rawMemberships = (membershipsRes.data as any[]) ?? [];
        const allMemberships: OrganizationMembership[] = rawMemberships
          .map((item) => {
            const organization = Array.isArray(item.organization) ? item.organization[0] ?? null : item.organization ?? null;
            return {
              id: item.id,
              user_id: item.user_id,
              organization_id: item.organization_id,
              role: item.role,
              status: item.status,
              is_default: Boolean(item.is_default),
              created_at: item.created_at,
              updated_at: item.updated_at,
              organization,
            } as OrganizationMembership;
          })
          .filter((item) => item && item.organization_id);

        const activeMemberships = allMemberships.filter((item) => item.status === UserStatus.ACTIVE);

        const preferredOrgId = profileData.active_organization_id as string | null;
        const chosenMembership =
          activeMemberships.find((item) => item.organization_id === preferredOrgId) ??
          activeMemberships.find((item) => item.is_default) ??
          activeMemberships[0] ??
          null;

        if (!chosenMembership) {
          throw new Error('No active organization membership found');
        }

        debugLog('identity.membership_selected', {
          userId,
          activeMembershipCount: activeMemberships.length,
          preferredOrgId,
          selectedOrganizationId: chosenMembership.organization_id,
          selectedRole: chosenMembership.role,
        });

        // Keep DB context aligned with the org selected from memberships.
        // Edge functions read profiles.active_organization_id for authz.
        if (preferredOrgId !== chosenMembership.organization_id) {
          const { error: switchError } = await supabase.functions.invoke('switch-active-organization', {
            body: {
              organization_id: chosenMembership.organization_id,
            },
          });

          if (switchError) {
            console.warn('active organization sync failed:', switchError.message);
          }
        }

        const hydratedProfile: Profile = {
          ...profileData,
          organization_id: chosenMembership.organization_id,
          active_organization_id: chosenMembership.organization_id,
          role: chosenMembership.role,
          status: chosenMembership.status,
        };

        return {
          profile: hydratedProfile,
          memberships: activeMemberships,
          activeOrganizationId: chosenMembership.organization_id,
          activeRole: chosenMembership.role,
          error: null,
          transientFailure: false,
        };
      } catch (error) {
        lastError = error;
        const transientFailure = isTransientProfileError(error);
        const shouldRetry = transientFailure && attempt < PROFILE_RETRY_BACKOFF_MS.length;

        if (shouldRetry) {
          await wait(PROFILE_RETRY_BACKOFF_MS[attempt]);
          continue;
        }

        return {
          profile: null,
          memberships: [],
          activeOrganizationId: null,
          activeRole: null,
          error: getErrorMessage(error),
          transientFailure,
        };
      }
    }

    return {
      profile: null,
      memberships: [],
      activeOrganizationId: null,
      activeRole: null,
      error: lastError ? getErrorMessage(lastError) : 'Unknown profile loading error',
      transientFailure: false,
    };
  }, []);

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
          return data.session;
        }
      } catch {
        // no-op
      }

      if (attempt < SESSION_RECOVERY_BACKOFF_MS.length) {
        await wait(SESSION_RECOVERY_BACKOFF_MS[attempt]);
      }
    }

    return null;
  }, []);

  const applySession = useCallback(
    async (nextSession: Session | null, options: ApplySessionOptions) => {
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
      });

      if (!resolvedSession) {
        if (token !== requestTokenRef.current) return;

        if (allowRecovery && authStateRef.current === 'authenticated' && lastKnownProfileRef.current) {
          setProfile(lastKnownProfileRef.current);
          setProfileError('Temporary session recovery issue');
          setAuthState('authenticated');
          setLoading(false);
          return;
        }

        setSession(null);
        setProfile(null);
        setMemberships([]);
        setActiveOrganizationId(null);
        setActiveRole(null);
        lastKnownProfileRef.current = null;
        setProfileError(null);
        setAuthState('unauthenticated');
        setLoading(false);
        return;
      }

      const result = await fetchIdentityWithRetry(resolvedSession.user.id);
      if (token !== requestTokenRef.current) return;

      if (result.profile) {
        setProfile(result.profile);
        setMemberships(result.memberships);
        setActiveOrganizationId(result.activeOrganizationId);
        setActiveRole(result.activeRole);
        lastKnownProfileRef.current = result.profile;
        setProfileError(null);
        setAuthState('authenticated');
        setLoading(false);
        return;
      }

      if (result.transientFailure && lastKnownProfileRef.current) {
        setProfile(lastKnownProfileRef.current);
        setProfileError(result.error ?? 'Temporary profile loading issue');
        setAuthState('authenticated');
        setLoading(false);
        return;
      }

      setProfile(null);
      setMemberships([]);
      setActiveOrganizationId(null);
      setActiveRole(null);
      setProfileError(result.error ?? 'Could not load profile');
      setAuthState('profile_error');
      setLoading(false);
    },
    [debugLog, fetchIdentityWithRetry, markAuthEvent, recoverSessionWithRetry],
  );

  const refreshProfile = async () => {
    if (runtimeAuthMode === 'demo') {
      setSession(null);
      setProfile(DEMO_PROFILE);
      setMemberships(DEMO_MEMBERSHIPS);
      setActiveOrganizationId('demo-org');
      setActiveRole(UserRole.ADMIN);
      setProfileError(null);
      setAuthState('authenticated');
      setLoading(false);
      lastKnownProfileRef.current = DEMO_PROFILE;
      return;
    }

    if (runtimeAuthMode !== 'supabase' || !supabase) {
      setSession(null);
      setProfile(null);
      setMemberships([]);
      setActiveOrganizationId(null);
      setActiveRole(null);
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
      setMemberships(DEMO_MEMBERSHIPS);
      setActiveOrganizationId('demo-org');
      setActiveRole(UserRole.ADMIN);
      lastKnownProfileRef.current = DEMO_PROFILE;
      setProfileError(null);
      setAuthState('authenticated');
      setLoading(false);
      return;
    }

    if (runtimeAuthMode !== 'supabase' || !supabase) {
      setSession(null);
      setProfile(null);
      setMemberships([]);
      setActiveOrganizationId(null);
      setActiveRole(null);
      lastKnownProfileRef.current = null;
      setProfileError('Missing auth configuration');
      setAuthState('unauthenticated');
      setLoading(false);
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

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void applySession(nextSession ?? null, {
          source: event === 'SIGNED_IN' ? 'signed_in' : 'user_updated',
          showBoot: !hasStableProfile,
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
        setMemberships([]);
        setActiveOrganizationId(null);
        setActiveRole(null);
        lastKnownProfileRef.current = null;
        setProfileError(getErrorMessage(error));
        setAuthState('profile_error');
        setLoading(false);
      }
    }, 1500);

    return () => {
      active = false;
      clearTimeout(fallbackTimer);
      subscription.unsubscribe();
    };
  }, [applySession, markAuthEvent]);

  useEffect(() => {
    if (runtimeAuthMode !== 'supabase' || !supabase || !session?.user?.id) {
      return;
    }

    const userId = session.user.id;
    let refreshTimer: number | null = null;
    const scheduleRefresh = (source: string) => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      refreshTimer = window.setTimeout(() => {
        debugLog('identity.realtime_refresh', { source, userId });
        void refreshProfile();
      }, 200);
    };

    const channel = supabase
      .channel(`auth-identity-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'organization_memberships',
          filter: `user_id=eq.${userId}`,
        },
        () => scheduleRefresh('organization_memberships'),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        () => scheduleRefresh('profiles'),
      )
      .subscribe();

    return () => {
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer);
      }
      supabase.removeChannel(channel);
    };
  }, [debugLog, refreshProfile, runtimeAuthMode, session?.user?.id]);

  const signIn = async (email: string, password: string) => {
    if (runtimeAuthMode === 'demo') {
      const demoProfile = {
        ...DEMO_PROFILE,
        email,
      };
      setSession(null);
      setProfile(demoProfile);
      setMemberships(DEMO_MEMBERSHIPS);
      setActiveOrganizationId('demo-org');
      setActiveRole(UserRole.ADMIN);
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
      setMemberships([]);
      setActiveOrganizationId(null);
      setActiveRole(null);
      lastKnownProfileRef.current = null;
      setProfileError(null);
      setAuthState('unauthenticated');
      setLoading(false);
      return;
    }

    if (runtimeAuthMode !== 'supabase' || !supabase) {
      setSession(null);
      setProfile(null);
      setMemberships([]);
      setActiveOrganizationId(null);
      setActiveRole(null);
      lastKnownProfileRef.current = null;
      setProfileError(null);
      setAuthState('unauthenticated');
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
  };

  const switchActiveOrganization = async (organizationId: string) => {
    if (runtimeAuthMode !== 'supabase' || !supabase) {
      return { error: 'Organization switch is only available in Supabase mode.' };
    }

    const { error } = await supabase.functions.invoke('switch-active-organization', {
      body: { organization_id: organizationId },
    });

    if (error) {
      return { error: error.message };
    }

    await refreshProfile();
    return {};
  };

  const value = useMemo<AuthContextType>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      memberships,
      activeOrganizationId,
      activeRole,
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
      switchActiveOrganization,
    }),
    [
      session,
      profile,
      memberships,
      activeOrganizationId,
      activeRole,
      loading,
      authState,
      profileError,
      authEventDebug,
      signIn,
      signOut,
      refreshProfile,
      retryProfileLoad,
      switchActiveOrganization,
    ],
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
