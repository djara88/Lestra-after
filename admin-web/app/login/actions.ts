'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function loginWithGoogle() {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const runtimeOrigin = host ? `${proto}://${host}` : null;
  const origin = process.env.NODE_ENV === 'development'
    ? (process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? runtimeOrigin)
    : runtimeOrigin;
  if (!origin) redirect('/login?error=config');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data.url) redirect('/login?error=google');
  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
