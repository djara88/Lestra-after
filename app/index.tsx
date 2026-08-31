import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

type FamilyContext = {
  family_id?: string | null;
  students?: Array<{ id?: string | null }> | null;
};
type AccessState = { state?: 'active' | 'paused' | 'closed' | 'none' };

function getFamilyContext(context: unknown): FamilyContext | null {
  if (Array.isArray(context)) {
    const row = context.find((item) => Boolean(item && typeof item === 'object' && 'family_id' in item && item.family_id));
    return row && typeof row === 'object' ? (row as FamilyContext) : null;
  }

  return context && typeof context === 'object' ? (context as FamilyContext) : null;
}

export default function Index() {
  const [retryKey, setRetryKey] = useState(0);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;

    async function routeSession() {
      setLoadError(false);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!active) return;

      if (userError) {
        setLoadError(true);
        return;
      }

      if (!user) {
        router.replace('/login');
        return;
      }

      const [{ data: accessData, error: accessError }, { data: context, error: contextError }] = await Promise.all([
        supabase.rpc('after_my_access_state'),
        supabase.rpc('after_my_context'),
      ]);
      if (!active) return;

      if (accessError || contextError) {
        setLoadError(true);
        return;
      }

      const access = (accessData ?? {}) as AccessState;
      if (access.state === 'paused' || access.state === 'closed') {
        router.replace('/access-paused');
        return;
      }

      const family = getFamilyContext(context);
      const hasFamily = Boolean(family?.family_id);
      const hasStudent = Boolean(family?.students?.some((student) => Boolean(student?.id)));

      router.replace(hasFamily && hasStudent ? '/(app)' : '/onboarding');
    }

    void routeSession();
    return () => { active = false; };
  }, [retryKey]);

  return (
    <View style={s.container}>
      {loadError ? (
        <>
          <Text style={s.title}>No pudimos cargar tu familia.</Text>
          <Text style={s.copy}>Tu sesión sigue protegida. Revisa tu conexión e intenta nuevamente.</Text>
          <Pressable style={s.button} onPress={() => setRetryKey((value) => value + 1)}>
            <Text style={s.buttonText}>Reintentar</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#F4F5F7' },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', color: '#111318' },
  copy: { marginTop: 10, fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#626975', maxWidth: 360 },
  button: { marginTop: 22, backgroundColor: '#111318', paddingHorizontal: 22, paddingVertical: 14, borderRadius: 14 },
  buttonText: { color: '#FFF', fontWeight: '800' },
});
