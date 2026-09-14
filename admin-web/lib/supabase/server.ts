import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieOptions = { domain?: string; expires?: Date; httpOnly?: boolean; maxAge?: number; path?: string; sameSite?: boolean|'lax'|'strict'|'none'; secure?: boolean };
type CookieToSet = { name: string; value: string; options?: CookieOptions };

const PRODUCTION_SUPABASE_URL = 'https://yihcktculicmuuzzxzik.supabase.co';
const PRODUCTION_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ZpxmCzRu3-CQ8LIUXhdZtA_lOhk_wzU';

export async function createClient() {
  const store = await cookies();
  const isDevelopment = process.env.NODE_ENV === 'development';
  const url = isDevelopment
    ? (process.env.NEXT_PUBLIC_SUPABASE_URL ?? PRODUCTION_SUPABASE_URL)
    : PRODUCTION_SUPABASE_URL;
  const key = isDevelopment
    ? (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? PRODUCTION_SUPABASE_PUBLISHABLE_KEY)
    : PRODUCTION_SUPABASE_PUBLISHABLE_KEY;

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
