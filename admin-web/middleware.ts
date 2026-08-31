import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '').toLowerCase();
  if (request.nextUrl.pathname === '/' && host.startsWith('admin.after.lestra.app')) {
    const url = request.nextUrl.clone();
    url.pathname = '/platform';
    return NextResponse.redirect(url);
  }
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
