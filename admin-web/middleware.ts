import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '').toLowerCase();
  const path = request.nextUrl.pathname;
  const isAdminHost = host.startsWith('admin.after.lestra.app');
  const isPublicHost = host === 'after.lestra.app' || host.startsWith('www.after.lestra.app');

  if (path === '/' && isAdminHost) {
    const url = request.nextUrl.clone();
    url.pathname = '/platform';
    return NextResponse.redirect(url);
  }

  if (isPublicHost && (path.startsWith('/platform') || path.startsWith('/login') || path.startsWith('/auth/'))) {
    const url = new URL(request.url);
    url.hostname = 'admin.after.lestra.app';
    url.protocol = 'https:';
    url.port = '';
    return NextResponse.redirect(url);
  }

  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
