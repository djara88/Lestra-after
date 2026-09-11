import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

const redirectTo = 'lestraafter://login';

function readParam(url: string, name: string) {
  const query = url.includes('?') ? url.split('?')[1]?.split('#')[0] ?? '' : '';
  const fragment = url.includes('#') ? url.split('#')[1] ?? '' : '';
  return new URLSearchParams(query).get(name) ?? new URLSearchParams(fragment).get(name);
}

export default function Login() {
  const [busy, setBusy] = useState(false);
  const completingRef = useRef(false);

  useEffect(() => {
    async function completeOAuth(url: string | null) {
      if (!url || !url.startsWith(redirectTo) || completingRef.current) return;
      completingRef.current = true;
      setBusy(true);

      try {
        const oauthError = readParam(url, 'error_description') ?? readParam(url, 'error');
        if (oauthError) throw new Error(oauthError);

        const code = readParam(url, 'code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          router.replace('/');
          return;
        }

        const accessToken = readParam(url, 'access_token');
        const refreshToken = readParam(url, 'refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          router.replace('/');
          return;
        }

        throw new Error('La respuesta de Google no incluyó una sesión válida.');
      } catch {
        Alert.alert('No pudimos completar el acceso', 'Vuelve a intentarlo con Google. Si el problema continúa, revisaremos la configuración de retorno de la aplicación.');
      } finally {
        completingRef.current = false;
        setBusy(false);
      }
    }

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void completeOAuth(url);
    });

    void Linking.getInitialURL().then((url) => completeOAuth(url));

    return () => subscription.remove();
  }, []);

  async function signInWithGoogle() {
    try {
      setBusy(true);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error('No se recibió URL de autenticación.');

      await Linking.openURL(data.url);
    } catch {
      Alert.alert('No pudimos iniciar sesión', 'No fue posible abrir el acceso con Google. Intenta nuevamente.');
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
        <Text style={s.legal}>Al continuar, Google se abrirá de forma segura para autenticar tu cuenta. After no recibe tu contraseña.</Text>
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
