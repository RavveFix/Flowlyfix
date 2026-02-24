import React from 'react';
import ReactDOM from 'react-dom/client';

import '@/app/styles/index.css';
import App from '@/app/App';
import {
  buildRuntimeSnapshot,
  getCanonicalDevRedirectTarget,
  runtimeConfig,
  type FlowlyRuntimeSnapshot,
} from '@/shared/config/runtime';

declare global {
  interface Window {
    __FLOWLY_RUNTIME__?: FlowlyRuntimeSnapshot;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const isDev = Boolean((import.meta as any).env?.DEV);
const redirectTarget = isDev ? getCanonicalDevRedirectTarget(window.location, runtimeConfig) : null;

if (redirectTarget) {
  window.location.replace(redirectTarget);
} else {
  if (isDev) {
    const snapshot = buildRuntimeSnapshot(window.location.origin, runtimeConfig);
    window.__FLOWLY_RUNTIME__ = snapshot;
    console.info('[runtime] boot', snapshot);
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
