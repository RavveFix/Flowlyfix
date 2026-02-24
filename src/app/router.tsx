import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthPage } from '@/features/auth/pages/AuthPage';
import { AuthConfigErrorPage } from '@/features/auth/pages/AuthConfigErrorPage';
import { ProfileLoadErrorPage } from '@/features/auth/pages/ProfileLoadErrorPage';
import { RequireRole } from '@/features/auth/guards/RequireRole';
import { useAuth } from '@/features/auth/state/AuthContext';
import { InAppNotifications } from '@/features/jobs/components/InAppNotifications';
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
  const { authState, loading, profile, profileError, retryProfileLoad, runtimeAuthMode, signOut } = useAuth();

  React.useEffect(() => {
    if (authState === 'authenticated' && !profile) {
      void retryProfileLoad();
    }
  }, [authState, profile, retryProfileLoad]);

  if (runtimeAuthMode === 'misconfigured') {
    return <AuthConfigErrorPage />;
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
          element={<Navigate to={profile.role === UserRole.TECHNICIAN ? '/field' : '/admin/dashboard'} replace />}
        />

        <Route
          path="/login"
          element={<Navigate to={profile.role === UserRole.TECHNICIAN ? '/field' : '/admin/dashboard'} replace />}
        />

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
      <InAppNotifications />

      <Suspense fallback={null}>
        <AIAssistant />
      </Suspense>
    </>
  );
};
