import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, SafeAreaView, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { completeOAuthUrl, dismissOAuthBrowser, GOOGLE_REDIRECT } from '@/lib/mobile-oauth';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function GoogleAuthCallback() {
  const params = useLocalSearchParams<Record<string, string | string[]>>();
  const [message, setMessage] = useState('Cerrando el acceso de Google…');

  useEffect(() => {
    let mounted = true;

    async function finish() {
      try {
        dismissOAuthBrowser();
        const initial = await Linking.getInitialURL();
        const code = first(params.code);
        const accessToken = first(params.access_token);
        const refreshToken = first(params.refresh_token);
        const error = first(params.error);
        const errorDescription = first(params.error_description);

        let callbackUrl = initial && initial.startsWith(GOOGLE_REDIRECT) ? initial : GOOGLE_REDIRECT;
        if (!callbackUrl.includes('?') && !callbackUrl.includes('#')) {
          const query = new URLSearchParams();
          if (code) query.set('code', code);
          if (error) query.set('error', error);
          if (errorDescription) query.set('error_description', errorDescription);
          if (query.toString()) callbackUrl = `${GOOGLE_REDIRECT}?${query.toString()}`;
          if (accessToken && refreshToken) {
            const fragment = new URLSearchParams({ access_token: accessToken, refresh_token: refreshToken });
            callbackUrl = `${GOOGLE_REDIRECT}#${fragment.toString()}`;
          }
        }

        await completeOAuthUrl(callbackUrl);
        dismissOAuthBrowser();
        router.replace('/');
      } catch (error) {
        console.error('Google callback route failed', error);
        if (!mounted) return;
        setMessage('No pudimos terminar el acceso. Volveremos al inicio de sesión.');
        setTimeout(() => router.replace('/login'), 1200);
      }
    }

    void finish();
    return () => {
      mounted = false;
    };
  }, [params]);

  return (
    <SafeAreaView style={s.safe}>
      <ActivityIndicator />
      <Text style={s.text}>{message}</Text>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28, backgroundColor: '#F7F7F5' },
  text: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: '#5C625D' },
});
