import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AuthPage } from '@/features/auth/pages/AuthPage';
import { SignupPage } from '@/features/auth/pages/SignupPage';
import { AuthConfigErrorPage } from '@/features/auth/pages/AuthConfigErrorPage';
import { ProfileLoadErrorPage } from '@/features/auth/pages/ProfileLoadErrorPage';
import { RequireRole } from '@/features/auth/guards/RequireRole';
import { useAuth } from '@/features/auth/state/AuthContext';
import { OfflineSyncBanner } from '@/features/jobs/components/OfflineSyncBanner';
import { UserRole } from '@/shared/types';
import { useLanguage } from '@/shared/i18n/LanguageContext';

const AdminLayout = lazy(() => import('@/app/layouts/AdminLayout').then((mod) => ({ default: mod.AdminLayout })));
const MobileApp = lazy(() => import('@/features/jobs/pages/MobileApp').then((mod) => ({ default: mod.MobileApp })));
const AIAssistant = lazy(() => import('@/features/assistant/components/AIAssistant').then((mod) => ({ default: mod.AIAssistant })));

const PageLoader = () => {
  const { t } = useLanguage();
  return <div className="min-h-screen flex items-center justify-center text-slate-500 bg-slate-100">{t('common.loading')}</div>;
};

export const AppRouter: React.FC = () => {
  const { authState, loading, profile, activeRole, profileError, retryProfileLoad, runtimeAuthMode, signOut } = useAuth();
  const location = useLocation();
  const hasAuthCallbackParams = React.useMemo(() => {
    if (!location.search && !location.hash) {
      return false;
    }

    const search = new URLSearchParams(location.search);
    const hashRaw = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
    const hash = new URLSearchParams(hashRaw);
    return (
      search.has('code') ||
      search.has('token_hash') ||
      search.has('type') ||
      hash.has('access_token') ||
      hash.has('refresh_token') ||
      hash.has('type')
    );
  }, [location.hash, location.search]);

  React.useEffect(() => {
    if (authState === 'authenticated' && !profile) {
      void retryProfileLoad();
    }
  }, [authState, profile, retryProfileLoad]);

  if (runtimeAuthMode === 'misconfigured') {
    return <AuthConfigErrorPage />;
  }

  // Allow login-related routes to render while auth bootstraps; otherwise tests and
  // real users can get stuck behind a global loader on /login.
  if ((loading || authState === 'bootstrapping') && (location.pathname === '/login' || location.pathname === '/signup' || location.pathname === '/auth/callback')) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/auth/callback" element={<AuthPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<PageLoader />} />
      </Routes>
    );
  }

  if (loading || authState === 'bootstrapping') {
    return <PageLoader />;
  }

  if (authState === 'profile_error') {
    return <ProfileLoadErrorPage error={profileError} onRetry={retryProfileLoad} onSignOut={signOut} />;
  }

  if (authState === 'unauthenticated') {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/auth/callback" element={<AuthPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (authState === 'authenticated' && !profile) {
    return <PageLoader />;
  }

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={<Navigate to={activeRole === UserRole.TECHNICIAN ? '/field' : '/admin/dashboard'} replace />}
        />

        <Route
          path="/login"
          element={
            <Navigate to={activeRole === UserRole.TECHNICIAN ? '/field' : '/admin/dashboard'} replace />
          }
        />
        <Route path="/auth/callback" element={<Navigate to={activeRole === UserRole.TECHNICIAN ? '/field' : '/admin/dashboard'} replace />} />

        <Route
          path="/admin/*"
          element={
            <RequireRole allow={[UserRole.ADMIN]}>
              <Suspense fallback={<PageLoader />}>
                <AdminLayout onSignOut={signOut} />
              </Suspense>
            </RequireRole>
          }
        />

        <Route
          path="/field"
          element={
            <RequireRole allow={[UserRole.ADMIN, UserRole.TECHNICIAN]}>
              <Suspense fallback={<PageLoader />}>
                <MobileApp isSimulator={false} />
              </Suspense>
            </RequireRole>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <OfflineSyncBanner />

      <Suspense fallback={null}>
        <AIAssistant />
      </Suspense>
    </>
  );
};
