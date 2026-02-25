import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/state/AuthContext';
import { useLanguage } from '@/shared/i18n/LanguageContext';
import { runtimeConfig } from '@/shared/config/runtime';
import { UserRole } from '@/shared/types';

interface RequireRoleProps {
  allow: UserRole[];
  children: React.ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({ allow, children }) => {
  const { profile, activeRole, loading } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-600">
        {t('common.loading')}
      </div>
    );
  }

  if (!profile) {
    if ((import.meta as any).env?.DEV && runtimeConfig.authDebugEnabled && location.pathname.startsWith('/admin')) {
      console.debug('[auth-guard] redirect unauthenticated admin request', {
        from: location.pathname,
        hasProfile: false,
        activeRole,
        destination: '/login',
      });
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!activeRole || !allow.includes(activeRole)) {
    const fallback = activeRole === UserRole.TECHNICIAN ? '/field' : '/login';
    if ((import.meta as any).env?.DEV && runtimeConfig.authDebugEnabled && location.pathname.startsWith('/admin')) {
      console.debug('[auth-guard] redirect role mismatch', {
        from: location.pathname,
        hasProfile: true,
        activeRole,
        destination: fallback,
      });
    }
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};
