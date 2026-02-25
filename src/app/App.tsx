import React from 'react';
import { BrowserRouter } from 'react-router-dom';

import { AppProviders } from '@/app/providers';
import { AppRouter } from '@/app/router';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </BrowserRouter>
  );
}
