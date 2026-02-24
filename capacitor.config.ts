import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.flowly.app',
  appName: 'Flowlyfix',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
