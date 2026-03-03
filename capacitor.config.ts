import type { CapacitorConfig } from '@capacitor/cli';

// Load .env so NEXT_PUBLIC_APP_URL is available when running cap commands
require('dotenv').config();

const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
const useRemote = Boolean(appUrl && !appUrl.includes('localhost'));

const config: CapacitorConfig = {
  appId: 'com.orioncmos.app',
  appName: 'Orion CMOS',
  webDir: 'www',
  server: useRemote
    ? {
        url: appUrl,
        cleartext: false,
      }
    : undefined,
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
