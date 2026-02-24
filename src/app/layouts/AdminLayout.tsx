import React, { Suspense, lazy, useMemo } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Box,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Smartphone,
  Truck,
  Users,
  Wrench,
} from 'lucide-react';

import { useAuth } from '@/features/auth/state/AuthContext';
import { useLanguage } from '@/shared/i18n/LanguageContext';
import { runtimeConfig } from '@/shared/config/runtime';
import { UserRole } from '@/shared/types';

const DesktopDashboard = lazy(() =>
  import('@/features/jobs/pages/DesktopDashboard').then((mod) => ({ default: mod.DesktopDashboard })),
);
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage').then((mod) => ({ default: mod.SettingsPage })));
const CustomersPage = lazy(() => import('@/features/resources/pages/CustomersPage').then((mod) => ({ default: mod.CustomersPage })));
const DispatchPage = lazy(() => import('@/features/jobs/pages/DispatchPage').then((mod) => ({ default: mod.DispatchPage })));
const WorkshopPage = lazy(() => import('@/features/jobs/pages/WorkshopPage').then((mod) => ({ default: mod.WorkshopPage })));
const ResourcesPage = lazy(() => import('@/features/resources/pages/ResourcesPage').then((mod) => ({ default: mod.ResourcesPage })));
const BillingPage = lazy(() => import('@/features/jobs/pages/BillingPage').then((mod) => ({ default: mod.BillingPage })));
const PublicPortal = lazy(() =>
  import('@/features/public-portal/pages/PublicPortal').then((mod) => ({ default: mod.PublicPortal })),
);
const MobileApp = lazy(() => import('@/features/jobs/pages/MobileApp').then((mod) => ({ default: mod.MobileApp })));

interface NavItemDef {
  to: string;
  label: string;
  icon: React.ReactNode;
  testId: string;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  testId: string;
  active?: boolean;
  onClick?: () => void;
}

interface AdminLayoutProps {
  onSignOut: () => Promise<void>;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, testId, active, onClick }) => (
  <button
    onClick={onClick}
    data-testid={testId}
    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-200 group relative ${
      active ? 'bg-slate-800 text-white font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }`}
  >
    <div className={`${active ? 'text-emerald-400' : 'text-slate-400 group-hover:text-white'} transition-colors`}>{icon}</div>
    <span className="text-sm inline">{label}</span>
    {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-emerald-500 rounded-r-md"></div>}
  </button>
);

const PageLoader = () => {
  const { t } = useLanguage();
  return <div className="h-full flex items-center justify-center text-slate-500">{t('common.loading')}</div>;
};

export const AdminLayout: React.FC<AdminLayoutProps> = ({ onSignOut }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const { authState, profile, runtimeAuthMode } = useAuth();
  const showAuthDebug = Boolean((import.meta as any).env?.DEV) && runtimeConfig.authDebugEnabled;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const navItems = useMemo<NavItemDef[]>(
    () => [
      { to: '/admin/dashboard', label: t('nav.dashboard'), icon: <LayoutDashboard size={18} />, testId: 'nav-dashboard' },
      { to: '/admin/dispatch', label: t('nav.dispatch'), icon: <Truck size={18} />, testId: 'nav-dispatch' },
      { to: '/admin/workshop', label: t('nav.workshop'), icon: <Wrench size={18} />, testId: 'nav-workshop' },
      { to: '/admin/billing', label: t('nav.billing'), icon: <Receipt size={18} />, testId: 'nav-billing' },
      { to: '/admin/customers', label: t('nav.customers'), icon: <Users size={18} />, testId: 'nav-customers' },
      { to: '/admin/resources', label: t('nav.resources'), icon: <Box size={18} />, testId: 'nav-resources' },
      { to: '/admin/settings', label: t('nav.settings'), icon: <Settings size={18} />, testId: 'nav-settings' },
    ],
    [t],
  );

  const hasBillingNav = useMemo(
    () => navItems.some((item) => item.to === '/admin/billing' && item.testId === 'nav-billing'),
    [navItems],
  );

  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    if (!((import.meta as any).env?.DEV)) {
      return;
    }

    if (profile?.role !== UserRole.ADMIN) {
      return;
    }

    if (!hasBillingNav) {
      console.error('[runtime] Admin nav invariant failed: nav-billing missing', {
        appInstanceId: runtimeConfig.appInstanceId,
        runtimeAuthMode,
        currentOrigin: window.location.origin,
      });
    }
  }, [hasBillingNav, profile?.role, runtimeAuthMode]);

  return (
    <div className="h-screen bg-docuraft-bg flex font-sans text-slate-900 overflow-hidden relative">
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 bg-docuraft-primary flex flex-col text-white shadow-2xl z-50 transition-transform duration-300 ease-in-out
          w-64 lg:static lg:translate-x-0 flex-shrink-0
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="h-16 flex items-center px-6 border-b border-slate-800 justify-between">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center font-bold text-white shadow-lg mr-3">
              F
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white">Flowlyfix</h1>
          </div>
          <button className="lg:hidden text-slate-400 p-1" onClick={() => setIsMobileMenuOpen(false)}>
            <LogOut size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1">
          {navItems.map((item) => (
            <NavItem
              key={item.to}
              icon={item.icon}
              label={item.label}
              testId={item.testId}
              active={location.pathname === item.to}
              onClick={() => navigate(item.to)}
            />
          ))}
        </nav>

        <div className="p-3 border-t border-slate-800 bg-slate-900/50">
          <div className="flex flex-col gap-1">
            <button
              onClick={() => navigate('/field')}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs font-medium transition-all text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <Smartphone size={16} />
              <span>{t('nav.field_app')}</span>
            </button>
            <button
              onClick={() => navigate('/admin/field-simulator')}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs font-medium transition-all text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <Smartphone size={16} />
              <span>{t('nav.field_simulator')}</span>
            </button>
            <button
              onClick={() => navigate('/admin/public')}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs font-medium transition-all text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <Globe size={16} />
              <span>{t('nav.public_portal')}</span>
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3 px-2 pt-3 border-t border-slate-800">
            <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-slate-300">
              {(profile?.full_name || 'AD').slice(0, 2).toUpperCase()}
            </div>
            <div className="overflow-hidden flex-1">
              <div className="text-xs font-bold text-white truncate">{profile?.full_name || t('common.admin_user')}</div>
              <div className="text-[10px] text-slate-400 truncate">{profile?.email || 'admin@flowly.io'}</div>
            </div>
            <button
              onClick={() => onSignOut()}
              className="text-slate-400 hover:text-white transition-colors p-1"
              title={t('common.sign_out')}
            >
              <LogOut size={16} />
            </button>
          </div>

          {showAuthDebug && (
            <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/40 px-2 py-1 text-[10px] text-slate-400" data-testid="auth-debug">
              {`instance:${runtimeConfig.appInstanceId} origin:${window.location.origin} auth:${authState} mode:${runtimeAuthMode} role:${profile?.role ?? '-'}`}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 relative overflow-hidden flex flex-col bg-docuraft-bg h-screen">
        <div className="lg:hidden bg-white border-b border-docuraft-border h-16 flex items-center px-4 justify-between sticky top-0 z-20 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <Menu size={22} />
            </button>
            <div className="font-bold text-slate-800">Flowlyfix</div>
          </div>
          <button className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
            <Bell size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="dashboard" element={<DesktopDashboard />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="dispatch" element={<DispatchPage />} />
              <Route path="workshop" element={<WorkshopPage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="resources" element={<ResourcesPage />} />
              <Route
                path="field-simulator"
                element={
                  <div className="flex-1 flex items-center justify-center p-4 lg:p-8 bg-slate-200 relative overflow-auto">
                    <div className="w-full max-w-[400px] h-[800px] max-h-full bg-slate-900 rounded-[55px] p-3 shadow-2xl relative z-10 border-4 border-slate-800 ring-4 ring-gray-300 mx-auto mt-12 lg:mt-0">
                      <div className="absolute top-24 -left-[6px] w-[6px] h-10 bg-slate-700 rounded-l-md hidden sm:block"></div>
                      <div className="absolute top-40 -left-[6px] w-[6px] h-16 bg-slate-700 rounded-l-md hidden sm:block"></div>
                      <div className="absolute top-40 -right-[6px] w-[6px] h-16 bg-slate-700 rounded-r-md hidden sm:block"></div>
                      <div className="w-full h-full bg-white rounded-[46px] overflow-hidden relative shadow-inner">
                        <MobileApp isSimulator={true} />
                      </div>
                    </div>
                  </div>
                }
              />
              <Route path="public" element={<PublicPortal />} />
              <Route path="*" element={<Navigate to="dashboard" replace />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
};
