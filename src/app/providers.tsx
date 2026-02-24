import React from 'react';

import { AuthProvider } from '@/features/auth/state/AuthContext';
import { JobProvider } from '@/features/jobs/state/JobContext';
import { ResourceProvider } from '@/features/resources/state/ResourceContext';
import { LanguageProvider } from '@/shared/i18n/LanguageContext';

interface AppProvidersProps {
  children: React.ReactNode;
}

export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <AuthProvider>
      <LanguageProvider>
        <ResourceProvider>
          <JobProvider>{children}</JobProvider>
        </ResourceProvider>
      </LanguageProvider>
    </AuthProvider>
  );
};
