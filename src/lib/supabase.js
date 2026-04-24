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

/* =============================================
   Supabase Client — SINGLETON
   Uses Clerk native third-party auth integration.
   ============================================= */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase env vars.');
}

// Module-level singleton — survives re-renders and route changes.
// Crucially this prevents "Multiple GoTrueClient instances" which
// was silently causing some requests to fall back to anon role.
let _client = null;
let _currentSession = null;

export function setActiveClerkSession(session) {
  _currentSession = session;
}

export function getSupabaseClient() {
  if (_client) return _client;

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // Native third-party auth: Supabase calls this on every request
    // to get a fresh Clerk token. No JWT templates, no aliases.
    accessToken: async () => {
      if (!_currentSession) return null;
      try {
        return await _currentSession.getToken();
      } catch {
        return null;
      }
    },
    auth: {
      persistSession:      false,
      autoRefreshToken:    false,
      detectSessionInUrl:  false,
      storageKey:          'dragonkeys-supabase-auth', // unique key to avoid collision
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

  return _client;
}