import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Falta configuración pública de Supabase.');

const secureStorage = {
  getItem: (keyName: string) => SecureStore.getItemAsync(keyName),
  setItem: (keyName: string, value: string) => SecureStore.setItemAsync(keyName, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }),
  removeItem: (keyName: string) => SecureStore.deleteItemAsync(keyName),
};

export const supabase = createClient(url, key, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// React Native does not expose browser visibility events. Keep token refresh active
// only while After is in the foreground so sessions remain current without doing
// unnecessary background work.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});

if (AppState.currentState === 'active') {
  void supabase.auth.startAutoRefresh();
}
