/* =============================================
   Supabase Client
   
   This uses the NATIVE Clerk ↔ Supabase integration
   (the modern approach — no more JWT templates).
   
   How it works:
   1. The Clerk session gives us a session token automatically.
   2. We pass an accessToken() callback to Supabase.
   3. Supabase verifies the token as a third-party auth provider.
   4. auth.jwt()->>'sub' inside Postgres = the Clerk user ID.
   5. Row Level Security uses that to filter rows.
   
   You need to enable Clerk as a third-party provider in:
   Supabase Dashboard → Authentication → Third Party Auth → Add Clerk
   ============================================= */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase env vars. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local'
  );
}

/**
 * Creates a Supabase client that authenticates using the current Clerk session.
 * Call this with the `session` object from Clerk's `useSession()` hook.
 *
 * Usage inside a component:
 *   const { session } = useSession();
 *   const supabase = useMemo(() => createClerkSupabaseClient(session), [session]);
 */
export function createClerkSupabaseClient(session) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      // Supabase calls this before every request to get a fresh token.
      // Returning null for signed-out users means the anon role is used.
      fetch: async (url, options = {}) => {
        const token = session ? await session.getToken() : null;
        const headers = new Headers(options.headers);
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return fetch(url, { ...options, headers });
      },
    },
    auth: {
      // We're not using Supabase's built-in auth — Clerk handles it.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
