import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const PRODUCTION_SUPABASE_URL = 'https://tdbfypwxgtadeeoihneq.supabase.co';
const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0pz3poS7oYx9z-4RJqSq3w_9xaqATdl';
const isDevelopment = process.env.NODE_ENV === 'development';
const url = isDevelopment
  ? (process.env.EXPO_PUBLIC_SUPABASE_URL ?? PRODUCTION_SUPABASE_URL)
  : PRODUCTION_SUPABASE_URL;
const key = isDevelopment
  ? (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? PRODUCTION_SUPABASE_PUBLISHABLE_KEY)
  : PRODUCTION_SUPABASE_PUBLISHABLE_KEY;

const CHUNK_SIZE = 1800;
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function metadataKey(keyName: string) {
  return `${keyName}.meta`;
}

function chunkKey(keyName: string, index: number) {
  return `${keyName}.${index}`;
}

async function readChunkCount(keyName: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(metadataKey(keyName));
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { chunks?: unknown };
    return Number.isInteger(parsed.chunks) && Number(parsed.chunks) > 0 ? Number(parsed.chunks) : 0;
  } catch {
    return 0;
  }
}

const secureStorage = {
  async getItem(keyName: string) {
    const chunkCount = await readChunkCount(keyName);
    if (chunkCount === 0) {
      return SecureStore.getItemAsync(keyName);
    }

    const chunks = await Promise.all(
      Array.from({ length: chunkCount }, (_, index) => SecureStore.getItemAsync(chunkKey(keyName, index))),
    );

    if (chunks.some((chunk) => chunk === null)) {
      await secureStorage.removeItem(keyName);
      return null;
    }

    return chunks.join('');
  },

  async setItem(keyName: string, value: string) {
    const previousCount = await readChunkCount(keyName);
    const chunks = value.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gs')) ?? [''];

    for (let index = 0; index < chunks.length; index += 1) {
      await SecureStore.setItemAsync(chunkKey(keyName, index), chunks[index] ?? '', secureOptions);
    }

    await SecureStore.setItemAsync(metadataKey(keyName), JSON.stringify({ version: 1, chunks: chunks.length }), secureOptions);
    await SecureStore.deleteItemAsync(keyName);

    for (let index = chunks.length; index < previousCount; index += 1) {
      await SecureStore.deleteItemAsync(chunkKey(keyName, index));
    }
  },

  async removeItem(keyName: string) {
    const chunkCount = await readChunkCount(keyName);
    await Promise.all([
      SecureStore.deleteItemAsync(keyName),
      SecureStore.deleteItemAsync(metadataKey(keyName)),
      ...Array.from({ length: chunkCount }, (_, index) => SecureStore.deleteItemAsync(chunkKey(keyName, index))),
    ]);
  },
};

export const supabase = createClient(url, key, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

if (Platform.OS !== 'web') {
  if (AppState.currentState === 'active') {
    supabase.auth.startAutoRefresh();
  }

  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
