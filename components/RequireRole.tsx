import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

interface RequireRoleProps {
  allow: UserRole[];
  children: React.ReactNode;
}

export const RequireRole: React.FC<RequireRoleProps> = ({ allow, children }) => {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-600">
        Loading...
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allow.includes(profile.role)) {
    const fallback = profile.role === UserRole.TECHNICIAN ? '/field' : '/admin/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};
