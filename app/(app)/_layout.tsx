import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StatusBar as RNStatusBar, StyleSheet, Text, View } from 'react-native';
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

function TabGlyph({ children, color }: { children: string; color: string }) {
  return <Text style={[s.tabGlyph, { color }]}>{children}</Text>;
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

  const androidTop = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 24 : 0;
  const bottomPad = Platform.OS === 'android' ? 12 : 7;

  return <Tabs screenOptions={{
    headerShown:false,
    sceneStyle:{paddingTop:androidTop,backgroundColor:'#F7F7F5'},
    tabBarHideOnKeyboard:true,
    tabBarActiveTintColor:'#1B211C',
    tabBarInactiveTintColor:'#9A9F9A',
    tabBarLabelStyle:{fontSize:10.5,fontWeight:'800',marginTop:1},
    tabBarStyle:{height:64+bottomPad,paddingBottom:bottomPad,paddingTop:6,borderTopColor:'#E3E5E0',backgroundColor:'#FBFBF9'},
  }}>
    <Tabs.Screen name="index" options={{ title:'Hoy', tabBarIcon:({color})=><TabGlyph color={color}>●</TabGlyph> }} />
    <Tabs.Screen name="agenda" options={{ title:'Semana', tabBarIcon:({color})=><TabGlyph color={color}>≡</TabGlyph> }} />
    <Tabs.Screen name="agregar" options={{ title:'Agregar', tabBarIcon:({color})=><TabGlyph color={color}>＋</TabGlyph> }} />
    <Tabs.Screen name="pendientes" options={{ title:'Pendientes', tabBarIcon:({color})=><TabGlyph color={color}>✓</TabGlyph> }} />
    <Tabs.Screen name="familia" options={{ title:'Familia', tabBarIcon:({color})=><TabGlyph color={color}>⌂</TabGlyph> }} />
    <Tabs.Screen name="estudio" options={{ href:null }} />
  </Tabs>;
}

const s = StyleSheet.create({
  container:{flex:1,alignItems:'center',justifyContent:'center',padding:28,backgroundColor:'#F4F5F7'},
  title:{fontSize:22,fontWeight:'800',textAlign:'center',color:'#111318'},
  copy:{marginTop:10,fontSize:15,lineHeight:22,textAlign:'center',color:'#626975',maxWidth:360},
  button:{marginTop:22,backgroundColor:'#111318',paddingHorizontal:22,paddingVertical:14,borderRadius:14},
  buttonText:{color:'#FFF',fontWeight:'800'},
  tabGlyph:{fontSize:17,lineHeight:19,fontWeight:'900'},
});