import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.marksentry.app', // This is your unique App ID
  appName: 'Marks Entry',
  webDir: 'dist',
  server: {
    url: 'https://ais-pre-cmabiki463lwphmvrpgcpc-679553863240.asia-southeast1.run.app', // Loads the live AI Studio app directly
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'always'
  }
};

export default config;