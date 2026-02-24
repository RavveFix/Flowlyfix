import { createClient } from '@supabase/supabase-js';

// Safely access environment variables.
// In Vite, import.meta.env is defined. In other environments, it might be undefined.
const env = (import.meta as any).env || {};

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    }) 
  : null;

export const isSupabaseConfigured = !!supabase;

export function assertSupabaseConfigured() {
  if (!supabase) {
    throw new Error('Supabase is not configured');
  }
  return supabase;
}
