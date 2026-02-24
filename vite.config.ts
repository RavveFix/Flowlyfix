import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  const canonicalOrigin = env.VITE_CANONICAL_DEV_ORIGIN || 'http://localhost:3000';
  let hmrHost = env.VITE_HMR_HOST || '127.0.0.1';
  let hmrPort = 3000;

  try {
    const parsed = new URL(canonicalOrigin);
    hmrPort = parsed.port ? Number(parsed.port) : hmrPort;

    if (!env.VITE_HMR_HOST && parsed.hostname && parsed.hostname !== 'localhost') {
      hmrHost = parsed.hostname;
    }
  } catch {
    // Use defaults when canonical origin is malformed.
  }

  return {
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      hmr: {
        protocol: 'ws',
        host: hmrHost,
        port: hmrPort,
        clientPort: hmrPort,
      },
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
