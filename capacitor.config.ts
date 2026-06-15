import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mensajeria.cadete',
  appName: 'Moto Express Cadete',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    hostname: 'app',
    allowNavigation: ['*.supabase.co'],
  },
  plugins: {
    Geolocation: {
      permissions: {
        background: true,
      },
    },
  },
  android: {
    backgroundColor: '#f9fafb',
  },
};

export default config;
