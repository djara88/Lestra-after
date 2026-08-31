import { useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AccessPaused() {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) {
      Alert.alert('No pudimos cerrar la sesión', 'Revisa tu conexión e intenta nuevamente.');
      return;
    }
    router.replace('/login');
  }

  return <SafeAreaView style={s.safe}><View style={s.card}>
    <View style={s.mark}><Text style={s.markText}>L</Text></View>
    <Text style={s.kicker}>ACCESO CONTROLADO</Text>
    <Text style={s.title}>Cuenta temporalmente pausada</Text>
    <Text style={s.copy}>Tu información familiar permanece guardada y aislada. El acceso operativo está suspendido; contacta a Lestra para solicitar la reactivación.</Text>
    <Pressable disabled={busy} onPress={() => router.replace('/')} style={s.primary}><Text style={s.primaryText}>Verificar de nuevo</Text></Pressable>
    <Pressable disabled={busy} onPress={signOut} style={s.secondary}><Text style={s.secondaryText}>{busy ? 'Cerrando…' : 'Cerrar sesión'}</Text></Pressable>
  </View></SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F5F7', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 460, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E3E7', borderRadius: 24, padding: 28 },
  mark: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111318', marginBottom: 34 },
  markText: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: '#7A818B', marginBottom: 10 },
  title: { color: '#111318', fontSize: 32, lineHeight: 37, fontWeight: '900', letterSpacing: -1, marginBottom: 14 },
  copy: { color: '#626A75', fontSize: 15, lineHeight: 23, marginBottom: 26 },
  primary: { backgroundColor: '#111318', borderRadius: 14, padding: 15, alignItems: 'center' },
  primaryText: { color: '#FFF', fontWeight: '800' },
  secondary: { borderWidth: 1, borderColor: '#DDE1E5', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 10 },
  secondaryText: { color: '#343941', fontWeight: '800' },
});
