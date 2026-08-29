import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';

export default function RootLayout() {
  useEffect(() => {
    const syncRefresh = (state: string) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    };

    syncRefresh(AppState.currentState);
    const subscription = AppState.addEventListener('change', syncRefresh);
    return () => {
      subscription.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  return <><StatusBar style="auto" /><Stack screenOptions={{ headerShown: false }} /></>;
}
