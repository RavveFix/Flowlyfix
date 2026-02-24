import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/shared/i18n/LanguageContext';

export const AuthConfigErrorPage: React.FC = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-5 inline-flex rounded-xl bg-rose-50 p-3 text-rose-700 border border-rose-200">
          <AlertTriangle className="w-5 h-5" />
        </div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('auth.config_error_title')}</h1>
        <p className="text-sm text-slate-600 mb-4">{t('auth.config_error_message')}</p>
        <p className="text-xs text-slate-500 leading-relaxed">{t('auth.config_error_hint')}</p>
      </div>
    </div>
  );
};
