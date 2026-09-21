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

    const handleOAuthCallback = async ({ url }: { url: string }) => {
      if (!url.startsWith(GOOGLE_REDIRECT)) return;

      try {
        setBusy(true);
        await completeOAuthUrl(url);

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) throw new Error('Google volvió a After, pero Supabase no creó una sesión.');

        dismissOAuthBrowser();
        router.replace('/');
      } catch (error) {
        console.error('Google OAuth callback failed', error);
        dismissOAuthBrowser();
        Alert.alert('No pudimos iniciar sesión', 'Google validó tu identidad, pero After no pudo crear la sesión.');
      } finally {
        setBusy(false);
      }
    };

    const subscription = Linking.addEventListener('url', handleOAuthCallback);
    void Linking.getInitialURL().then((url) => {
      if (url?.startsWith(GOOGLE_REDIRECT)) {
        void handleOAuthCallback({ url });
      }
    });

    return () => {
      subscription.remove();
      void WebBrowser.coolDownAsync();
    };
  }, []);

  async function signInWithGoogle() {
    try {
      setBusy(true);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: GOOGLE_REDIRECT,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) throw error;
      if (!data.url) throw new Error('No se recibió la URL de autenticación de Google.');

      const result = await WebBrowser.openAuthSessionAsync(data.url, GOOGLE_REDIRECT, {
        showInRecents: true,
      });

      if (result.type !== 'success') {
        if (result.type !== 'cancel' && result.type !== 'dismiss') {
          throw new Error(`Google OAuth terminó con estado: ${result.type}`);
        }
        return;
      }

      await completeOAuthUrl(result.url);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) {
        throw new Error('Google volvió a After, pero Supabase no creó una sesión.');
      }

      dismissOAuthBrowser();
      router.replace('/');
    } catch (error) {
      console.error('Google OAuth failed', error);
      dismissOAuthBrowser();
      Alert.alert(
        'No pudimos iniciar sesión',
        'No fue posible completar el acceso con Google. Intenta nuevamente.',
      );
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