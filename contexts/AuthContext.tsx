import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Profile, UserRole } from '../types';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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

export const AuthProvider = ({ children }: { children?: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setProfile(DEMO_PROFILE);
      return;
    }

    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Failed to load profile:', error.message);
      setProfile(null);
      return;
    }

    setProfile(data as Profile);
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setProfile(DEMO_PROFILE);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session: nextSession } }) => {
      setSession(nextSession);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    refreshProfile().catch((error) => {
      console.error('refreshProfile failed:', error);
    });
  }, [session?.user?.id, loading]);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured || !supabase) {
      setProfile({
        ...DEMO_PROFILE,
        email,
      });
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
      isConfigured: isSupabaseConfigured,
      signIn,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading],
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
