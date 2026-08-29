import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

function hasFamilyContext(context: unknown) {
  if (Array.isArray(context)) {
    return context.some((row) => Boolean(row && typeof row === 'object' && 'family_id' in row && row.family_id));
  }

  return Boolean(context && typeof context === 'object' && 'family_id' in context && context.family_id);
}

export default function Index() {
  useEffect(() => {
    let active = true;
    async function routeSession() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) return router.replace('/login');
      const { data: context, error } = await supabase.rpc('after_my_context');
      if (!active) return;
      if (error) return router.replace('/login');
      router.replace(hasFamilyContext(context) ? '/(app)' : '/onboarding');
    }
    routeSession();
    return () => { active = false; };
  }, []);
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
}
