import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AppLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function validateAccess() {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!mounted) return;
      if (userError || !user) {
        router.replace('/login');
        return;
      }

      const { data: context, error: contextError } = await supabase.rpc('after_my_context');
      if (!mounted) return;
      if (contextError) {
        await supabase.auth.signOut();
        router.replace('/login');
        return;
      }

      const hasFamily = Boolean(context && typeof context === 'object' && 'family_id' in context);
      if (!hasFamily) {
        router.replace('/onboarding');
        return;
      }

      setReady(true);
    }

    void validateAccess();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login');
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!ready) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  }

  return <Tabs screenOptions={{ headerShown: false, tabBarLabelStyle: { fontSize: 11 } }}>
    <Tabs.Screen name="index" options={{ title: 'Hoy' }} />
    <Tabs.Screen name="estudio" options={{ title: 'Estudio' }} />
    <Tabs.Screen name="agenda" options={{ title: 'Agenda' }} />
    <Tabs.Screen name="agregar" options={{ title: 'Agregar' }} />
    <Tabs.Screen name="familia" options={{ title: 'Familia' }} />
  </Tabs>;
}
