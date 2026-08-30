import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '');
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  const publicOrigin = configured ?? (forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin);

  if (!code) {
    return NextResponse.redirect(`${publicOrigin}/login?error=google`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${publicOrigin}/login?error=google`);
  }

  return NextResponse.redirect(`${publicOrigin}/platform`);
}
