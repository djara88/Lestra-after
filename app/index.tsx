import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function Index() {
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => router.replace(data.session ? '/(app)' : '/login'));
  }, []);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
}