import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieOptions = { domain?: string; expires?: Date; httpOnly?: boolean; maxAge?: number; path?: string; sameSite?: boolean|'lax'|'strict'|'none'; secure?: boolean };
type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function createClient() {
  const store = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase public environment variables are not configured.');

  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet: CookieToSet[]) {
        try { cookiesToSet.forEach(({name,value,options}) => store.set(name,value,options)); }
        catch { /* Server Components cannot always write cookies. */ }
      },
    },
  });
}
