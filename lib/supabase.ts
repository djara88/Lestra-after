import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
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
