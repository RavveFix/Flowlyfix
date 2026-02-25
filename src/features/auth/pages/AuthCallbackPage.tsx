import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { EmailOtpType } from '@supabase/supabase-js';

import { supabase } from '@/shared/lib/supabase/client';

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

function parseHashParams(hashValue: string) {
  const raw = hashValue.startsWith('#') ? hashValue.slice(1) : hashValue;
  return new URLSearchParams(raw);
}

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return !!value && OTP_TYPES.includes(value as EmailOtpType);
}

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const completeAuth = async () => {
      if (!supabase) {
        if (mounted) {
          setError('Supabase är inte konfigurerat.');
        }
        return;
      }

      try {
        const url = new URL(window.location.href);
        const search = url.searchParams;
        const hash = parseHashParams(url.hash);
        const code = search.get('code');
        const tokenHash = search.get('token_hash');
        const callbackType = search.get('type') ?? hash.get('type');
        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');

        // Force session switch when user opens an invite on a browser already signed in as another account.
        await supabase.auth.signOut({ scope: 'local' });

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        } else if (tokenHash && isEmailOtpType(callbackType)) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: callbackType,
          });
          if (verifyError) {
            throw verifyError;
          }
        } else if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError) {
            throw setSessionError;
          }
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        if (!data.session) {
          throw new Error('Ingen giltig sessionsdata hittades i länken.');
        }

        if (!mounted) {
          return;
        }

        navigate('/', { replace: true });
      } catch (callbackError) {
        if (!mounted) {
          return;
        }
        setError(callbackError instanceof Error ? callbackError.message : 'Kunde inte slutföra inloggning via länken.');
      }
    };

    void completeAuth();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2 items-start">
            <AlertCircle className="w-4 h-4 mt-0.5" />
            {error}
          </div>
        ) : (
          <div className="text-sm text-slate-600 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Slutför inloggning...
          </div>
        )}
      </div>
    </div>
  );
};
