import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { completeOAuthUrl, dismissOAuthBrowser, GOOGLE_REDIRECT } from '@/lib/mobile-oauth';

WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  async function signInWithGoogle() {
    let handled = false;
    let callbackSubscription: ReturnType<typeof Linking.addEventListener> | null = null;

    const finish = async (url: string) => {
      if (handled || !url.startsWith(GOOGLE_REDIRECT)) return;
      handled = true;
      dismissOAuthBrowser();
      await completeOAuthUrl(url);
      router.replace('/');
    };

    try {
      setBusy(true);

      callbackSubscription = Linking.addEventListener('url', ({ url }) => {
        void finish(url).catch((error) => {
          console.error('Google OAuth deep-link callback failed', error);
          Alert.alert('No pudimos iniciar sesión', 'Google respondió, pero no pudimos cerrar correctamente el acceso. Intenta nuevamente.');
          setBusy(false);
        });
      });

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: GOOGLE_REDIRECT,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error('No se recibió URL de autenticación.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, GOOGLE_REDIRECT, {
        showInRecents: false,
      });

      if (result.type === 'success') {
        await finish(result.url);
      }
    } catch (error) {
      console.error('Google OAuth failed', error);
      dismissOAuthBrowser();
      Alert.alert(
        'No pudimos iniciar sesión',
        'No fue posible completar el acceso con Google. Intenta nuevamente.',
      );
    } finally {
      callbackSubscription?.remove();
      if (!handled) setBusy(false);
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