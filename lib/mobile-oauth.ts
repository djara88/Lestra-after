import * as WebBrowser from 'expo-web-browser';
import type { Provider } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export const AUTH_REDIRECT = 'lestraafter://auth/callback';

function readParam(url: string, name: string) {
  const query = url.includes('?') ? url.split('?')[1]?.split('#')[0] ?? '' : '';
  const fragment = url.includes('#') ? url.split('#')[1] ?? '' : '';
  return new URLSearchParams(query).get(name) ?? new URLSearchParams(fragment).get(name);
}

export function dismissOAuthBrowser() {
  try {
    WebBrowser.dismissAuthSession();
  } catch {
    // Android can report there is no active auth session after the deep link already resumed the app.
  }
  try {
    WebBrowser.dismissBrowser();
  } catch {
    // Closing an already dismissed custom tab is harmless.
  }
}

export async function getOAuthUrl(provider: Extract<Provider, 'google' | 'azure'>) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: AUTH_REDIRECT,
      skipBrowserRedirect: true,
      scopes: provider === 'azure' ? 'email' : undefined,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('El proveedor de identidad no devolvió una URL de acceso.');
  return data.url;
}

export async function getEnterpriseSsoUrl(domain: string) {
  const normalizedDomain = domain.trim().toLowerCase().replace(/^@/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalizedDomain)) {
    throw new Error('Escribe un dominio corporativo válido, por ejemplo empresa.cl.');
  }

  const { data, error } = await supabase.auth.signInWithSSO({
    domain: normalizedDomain,
    options: { redirectTo: AUTH_REDIRECT },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('No hay un proveedor SSO configurado para ese dominio.');
  return data.url;
}

export async function completeOAuthUrl(url: string) {
  const oauthError = readParam(url, 'error_description') ?? readParam(url, 'error');
  if (oauthError) throw new Error(oauthError);

  const accessToken = readParam(url, 'access_token');
  const refreshToken = readParam(url, 'refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return;
  }

  const code = readParam(url, 'code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  throw new Error('El proveedor de identidad no devolvió una sesión válida.');
}
