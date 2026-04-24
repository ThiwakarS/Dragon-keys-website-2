/* =============================================
   Supabase Client — SINGLETON
   Uses Clerk native third-party auth integration.

   CRITICAL: this replaces the previous per-session factory.
   Why? The old approach manually attached Clerk's raw session
   token as a Bearer header. That made auth.jwt() return NULL
   inside RLS evaluation (even though writes via SECURITY DEFINER
   RPCs still worked). So users couldn't read their own orders back.

   The modern pattern — accessToken callback + singleton client —
   gives Supabase's native integration what it expects and fixes
   the invisible-reads bug.
   ============================================= */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase env vars. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

// One client for the whole app lifetime. Survives re-renders,
// route changes, hot-module reloads. Prevents "Multiple GoTrueClient"
// warnings and auth-state collisions in localStorage.
let _client = null;
let _currentSession = null;

/**
 * Register the currently-signed-in Clerk session with the singleton.
 * The client will call session.getToken() on every request, so the
 * reference needs to stay current as the user signs in / out.
 */
export function setActiveClerkSession(session) {
  _currentSession = session;
}

/**
 * Returns the singleton Supabase client. Safe to call many times.
 */
export function getSupabaseClient() {
  if (_client) return _client;

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // Modern native third-party auth. Supabase calls this before
    // every request and attaches the token as the Authorization
    // header itself — no manual fetch override needed.
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
      // Unique storage key so we never collide with any other
      // Supabase client that might exist in the page (prevents
      // "Multiple GoTrueClient instances" warnings).
      storageKey:          'dragonkeys-supabase-auth',
    },

    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

  return _client;
}