import React, { useState } from 'react';
import { LogIn, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/features/auth/state/AuthContext';
import { useLanguage } from '@/shared/i18n/LanguageContext';
import { supabase } from '@/shared/lib/supabase/client';

export const AuthPage: React.FC = () => {
  const { signIn, isConfigured, runtimeAuthMode, profileError } = useAuth();
  const { t } = useLanguage();
  const isDemoMode = runtimeAuthMode === 'demo';
  const [email, setEmail] = useState(isDemoMode ? 'admin@flowly.io' : '');
  const [password, setPassword] = useState(isDemoMode ? 'password123' : '');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const result = await signIn(email, password);
    if (result.error) {
      setError(result.error);
    }

    setLoading(false);
  };

  const handlePasswordReset = async () => {
    if (!email || runtimeAuthMode !== 'supabase' || !supabase) {
      setError(t('auth.password_reset_enter_email'));
      return;
    }

    setResetting(true);
    setError(null);
    setInfo(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setInfo(t('auth.password_reset_sent'));
    }

    setResetting(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Flowlyfix</h1>
        <p className="text-sm text-slate-500 mb-6">{t('auth.sign_in_to_continue')}</p>

        {!isConfigured && runtimeAuthMode === 'demo' && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            {t('auth.demo_mode_enabled')}
          </div>
        )}

        {error && (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            {error}
          </div>
        )}

        {!error && (profileError || info) && (
          <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700 flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            {profileError || info}
          </div>
        )}

        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('common.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('common.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-900/10"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 transition flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
            {loading ? t('common.signing_in') : t('common.sign_in')}
          </button>

          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={resetting || loading}
            className="w-full rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 transition disabled:opacity-70"
          >
            {resetting ? t('auth.password_reset_sending') : t('auth.forgot_password')}
          </button>
        </form>
      </div>
    </div>
  );
};
