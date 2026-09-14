import { useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  AUTH_REDIRECT,
  completeOAuthUrl,
  dismissOAuthBrowser,
  getEnterpriseSsoUrl,
  getOAuthUrl,
} from '@/lib/mobile-oauth';

WebBrowser.maybeCompleteAuthSession();

const azureEnabled = process.env.EXPO_PUBLIC_ENABLE_AZURE_AUTH === 'true';
const enterpriseSsoEnabled = process.env.EXPO_PUBLIC_ENABLE_ENTERPRISE_SSO === 'true';

type BusyProvider = 'google' | 'azure' | 'sso' | null;

export default function Login() {
  const [busy, setBusy] = useState<BusyProvider>(null);
  const [showSso, setShowSso] = useState(false);
  const [domain, setDomain] = useState('');

  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  async function openIdentityUrl(url: string) {
    const result = await WebBrowser.openAuthSessionAsync(url, AUTH_REDIRECT, { showInRecents: true });
    if (result.type !== 'success') {
      if (result.type !== 'cancel' && result.type !== 'dismiss') {
        throw new Error(`El acceso terminó con estado: ${result.type}`);
      }
      return false;
    }
    await completeOAuthUrl(result.url);
    dismissOAuthBrowser();
    router.replace('/');
    return true;
  }

  async function signIn(provider: 'google' | 'azure') {
    if (busy) return;
    try {
      setBusy(provider);
      await openIdentityUrl(await getOAuthUrl(provider));
    } catch (error) {
      console.error(`${provider} OAuth failed`, error);
      dismissOAuthBrowser();
      Alert.alert(
        'No pudimos iniciar sesión',
        error instanceof Error ? error.message : 'No fue posible completar el acceso. Intenta nuevamente.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function signInWithSso() {
    if (busy) return;
    try {
      setBusy('sso');
      await openIdentityUrl(await getEnterpriseSsoUrl(domain));
    } catch (error) {
      console.error('Enterprise SSO failed', error);
      dismissOAuthBrowser();
      Alert.alert(
        'No pudimos usar ese acceso corporativo',
        error instanceof Error ? error.message : 'Revisa el dominio e intenta nuevamente.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.card}>
        <Text style={s.brand}>Lestra After</Text>
        <Text style={s.title}>Todo lo importante de tus hijos, en un solo lugar.</Text>
        <Text style={s.copy}>Elige el proveedor de identidad de tu cuenta. After no administra contraseñas de Google, Microsoft ni de tu organización.</Text>

        <Pressable disabled={Boolean(busy)} style={[s.button, busy && s.disabled]} onPress={() => void signIn('google')}>
          <Text style={s.providerMark}>G</Text>
          <Text style={s.buttonText}>{busy === 'google' ? 'Ingresando…' : 'Continuar con Google'}</Text>
        </Pressable>

        {azureEnabled ? (
          <Pressable disabled={Boolean(busy)} style={[s.button, busy && s.disabled]} onPress={() => void signIn('azure')}>
            <Text style={s.providerMark}>M</Text>
            <Text style={s.buttonText}>{busy === 'azure' ? 'Ingresando…' : 'Continuar con Microsoft'}</Text>
          </Pressable>
        ) : null}

        {enterpriseSsoEnabled ? (
          <View style={s.ssoBox}>
            <Pressable disabled={Boolean(busy)} onPress={() => setShowSso(value => !value)} style={s.ssoToggle}>
              <Text style={s.ssoToggleText}>Acceso de otra organización</Text>
              <Text style={s.ssoToggleMark}>{showSso ? '−' : '+'}</Text>
            </Pressable>
            {showSso ? (
              <View style={s.ssoFields}>
                <Text style={s.ssoHelp}>Usa el dominio que tu organización tenga registrado en After, por ejemplo empresa.cl.</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={domain}
                  onChangeText={setDomain}
                  editable={!busy}
                  placeholder="empresa.cl"
                  placeholderTextColor="#9A9FA7"
                  style={s.input}
                />
                <Pressable disabled={Boolean(busy) || !domain.trim()} onPress={() => void signInWithSso()} style={[s.corporateButton, (busy || !domain.trim()) && s.disabled]}>
                  <Text style={s.corporateButtonText}>{busy === 'sso' ? 'Conectando…' : 'Continuar con SSO corporativo'}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={s.legal}>La sesión se valida mediante Supabase Auth y el proveedor de identidad elegido. El acceso a cada familia sigue protegido por permisos y RLS dentro de After.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F5F7', justifyContent: 'center', padding: 24 },
  card: { gap: 14 },
  brand: { fontSize: 16, fontWeight: '800', color: '#31343A' },
  title: { fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -1.1, color: '#111318' },
  copy: { fontSize: 15.5, lineHeight: 23, color: '#5C626D', marginBottom: 10 },
  button: { minHeight: 56, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#D8DCE2', borderRadius: 16, paddingHorizontal: 17, alignItems: 'center', flexDirection: 'row', gap: 12 },
  disabled: { opacity: 0.5 },
  providerMark: { width: 24, textAlign: 'center', fontSize: 20, fontWeight: '900', color: '#31343A' },
  buttonText: { color: '#111318', fontWeight: '800', fontSize: 16 },
  ssoBox: { borderTopWidth: 1, borderColor: '#E0E3E8', marginTop: 2, paddingTop: 4 },
  ssoToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ssoToggleText: { fontSize: 14, fontWeight: '800', color: '#4A5059' },
  ssoToggleMark: { fontSize: 20, color: '#6B717B' },
  ssoFields: { gap: 10, paddingBottom: 4 },
  ssoHelp: { fontSize: 12.5, lineHeight: 18, color: '#6C727C' },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#D8DCE2', backgroundColor: '#FFF', paddingHorizontal: 14, fontSize: 15, color: '#111318' },
  corporateButton: { minHeight: 50, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: '#344C3B' },
  corporateButtonText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  legal: { fontSize: 12, lineHeight: 18, color: '#747B86', marginTop: 4 },
});
