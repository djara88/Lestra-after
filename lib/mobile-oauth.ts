import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';

export const GOOGLE_REDIRECT = 'lestraafter://google-auth';

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
    // Same as above: closing an already dismissed custom tab is harmless.
  }
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

  throw new Error('La respuesta de Google no incluyó una sesión válida.');
}
