import { useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { GoogleSignin, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '@/lib/supabase';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export default function Login() {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (webClientId) GoogleSignin.configure({ webClientId, iosClientId });
  }, []);

  async function signInWithGoogle() {
    if (!webClientId) {
      Alert.alert('Configuración pendiente', 'El acceso con Google aún no tiene configurado su Client ID.');
      return;
    }

    try {
      setBusy(true);
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response) || !response.data.idToken) return;

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.data.idToken,
      });
      if (error) throw error;

      router.replace('/');
    } catch (error: any) {
      if (error?.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (error?.code === statusCodes.IN_PROGRESS) return;
      console.error('Google native sign-in failed', error);
      Alert.alert('No pudimos iniciar sesión', 'Intenta nuevamente. Si el problema continúa, revisaremos la configuración de acceso.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.card}>
        <Text style={s.brand}>Lestra After</Text>
        <Text style={s.title}>Todo lo importante de tus hijos, en un solo lugar.</Text>
        <Text style={s.copy}>Estudio, colegio, actividades, salud y compromisos familiares organizados alrededor de cada alumno.</Text>
        <Pressable disabled={busy} style={[s.button, busy && s.disabled]} onPress={signInWithGoogle}>
          <Text style={s.google}>G</Text><Text style={s.buttonText}>{busy ? 'Ingresando…' : 'Continuar con Google'}</Text>
        </Pressable>
        <Text style={s.legal}>Al continuar, la autenticación se realiza con Google. Los permisos familiares se administran exclusivamente dentro de Lestra After.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F5F7', justifyContent: 'center', padding: 24 },
  card: { gap: 18 }, brand: { fontSize: 16, fontWeight: '800' }, title: { fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -1.1 },
  copy: { fontSize: 16, lineHeight: 24, color: '#5C626D', marginBottom: 12 }, button: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8DCE2', borderRadius: 16, padding: 17, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 12 },
  disabled: { opacity: 0.55 }, google: { fontSize: 20, fontWeight: '900' }, buttonText: { color: '#111318', fontWeight: '800', fontSize: 16 }, legal: { fontSize: 12, lineHeight: 18, color: '#747B86' },
});