import React, { useState } from 'react';
import { AlertTriangle, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/shared/i18n/LanguageContext';

interface ProfileLoadErrorPageProps {
  error: string | null;
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const ProfileLoadErrorPage: React.FC<ProfileLoadErrorPageProps> = ({ error, onRetry, onSignOut }) => {
  const { t } = useLanguage();
  const [retrying, setRetrying] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-5 inline-flex rounded-xl bg-amber-50 p-3 text-amber-700 border border-amber-200">
          <AlertTriangle className="w-5 h-5" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('auth.profile_load_failed_title')}</h1>
        <p className="text-sm text-slate-600 mb-5">{t('auth.profile_load_failed_message')}</p>

        {error && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 break-words">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleRetry}
            disabled={retrying || signingOut}
            className="flex-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold py-2.5 transition inline-flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {t('auth.retry_profile')}
          </button>

          <button
            onClick={handleSignOut}
            disabled={retrying || signingOut}
            className="flex-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 transition inline-flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            {t('auth.sign_out_and_relogin')}
          </button>
        </div>
      </div>
    </div>
  );
};
