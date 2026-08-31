import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieOptions = { domain?: string; expires?: Date; httpOnly?: boolean; maxAge?: number; path?: string; sameSite?: boolean|'lax'|'strict'|'none'; secure?: boolean };
type CookieToSet = { name: string; value: string; options?: CookieOptions };

const PRODUCTION_SUPABASE_URL = 'https://tdbfypwxgtadeeoihneq.supabase.co';
const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_0pz3poS7oYx9z-4RJqSq3w_9xaqATdl';

function nextResponse(request: NextRequest, headers: Headers) {
  return NextResponse.next({ request: { headers } });
}

export async function updateSession(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  let response = nextResponse(request, requestHeaders);
  const isDevelopment = process.env.NODE_ENV === 'development';
  const url = isDevelopment
    ? (process.env.NEXT_PUBLIC_SUPABASE_URL ?? PRODUCTION_SUPABASE_URL)
    : PRODUCTION_SUPABASE_URL;
  const key = isDevelopment
    ? (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? PRODUCTION_SUPABASE_PUBLISHABLE_KEY)
    : PRODUCTION_SUPABASE_PUBLISHABLE_KEY;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextResponse(request, requestHeaders);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
