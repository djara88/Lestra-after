import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, router } from 'expo-router';
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

export default function AppLayout() {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function validateAccess() {
      setReady(false);setLoadError(false);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!mounted) return;
      if (userError) { setLoadError(true); return; }
      if (!user) { router.replace('/login'); return; }

      const [{ data: accessData, error: accessError }, { data: context, error: contextError }] = await Promise.all([
        supabase.rpc('after_my_access_state'),
        supabase.rpc('after_my_context'),
      ]);
      if (!mounted) return;
      if (accessError || contextError) { setLoadError(true); return; }

      const access = (accessData ?? {}) as AccessState;
      if (access.state === 'paused' || access.state === 'closed') { router.replace('/access-paused'); return; }
      const family = getFamilyContext(context);
      const hasFamily = Boolean(family?.family_id);
      const hasStudent = Boolean(family?.students?.some((student) => Boolean(student?.id)));
      if (!hasFamily || !hasStudent) { router.replace('/onboarding'); return; }
      setReady(true);
    }

    void validateAccess();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') router.replace('/login'); });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [retryKey]);

  if (!ready) {
    return <View style={s.container}>{loadError ? <><Text style={s.title}>No pudimos abrir tu espacio familiar.</Text><Text style={s.copy}>No cerramos tu sesión por un problema temporal de conexión. Puedes reintentar de forma segura.</Text><Pressable style={s.button} onPress={() => setRetryKey((value) => value + 1)}><Text style={s.buttonText}>Reintentar</Text></Pressable></> : <ActivityIndicator />}</View>;
  }

  return <Tabs screenOptions={{ headerShown:false, tabBarLabelStyle:{fontSize:11,fontWeight:'700'}, tabBarStyle:{height:62,paddingBottom:7,paddingTop:5} }}>
    <Tabs.Screen name="index" options={{ title:'Hoy' }} />
    <Tabs.Screen name="agenda" options={{ title:'Semana' }} />
    <Tabs.Screen name="agregar" options={{ title:'Agregar' }} />
    <Tabs.Screen name="pendientes" options={{ title:'Pendientes' }} />
    <Tabs.Screen name="familia" options={{ title:'Familia' }} />
    <Tabs.Screen name="estudio" options={{ href:null }} />
  </Tabs>;
}

const s = StyleSheet.create({
  container:{flex:1,alignItems:'center',justifyContent:'center',padding:28,backgroundColor:'#F4F5F7'},
  title:{fontSize:22,fontWeight:'800',textAlign:'center',color:'#111318'},
  copy:{marginTop:10,fontSize:15,lineHeight:22,textAlign:'center',color:'#626975',maxWidth:360},
  button:{marginTop:22,backgroundColor:'#111318',paddingHorizontal:22,paddingVertical:14,borderRadius:14},
  buttonText:{color:'#FFF',fontWeight:'800'},
});
