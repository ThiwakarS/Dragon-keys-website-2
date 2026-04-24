import { useEffect } from 'react';
import { useSession } from '@clerk/clerk-react';
import { getSupabaseClient, setActiveClerkSession } from '../lib/supabase.js';

/**
 * Returns the singleton Supabase client.
 * Keeps the accessToken callback in sync with the current Clerk session.
 *
 * The client reference is STABLE across renders (it's a module-level
 * singleton). React useEffect dependency arrays that include `supabase`
 * will fire exactly once on mount, which is what you want for
 * data-fetching effects and realtime subscriptions.
 */
export function useSupabase() {
  const { session, isLoaded } = useSession();

  // Keep the session reference fresh inside the singleton on every render.
  // This is synchronous; no need to wait for a useEffect tick.
  if (isLoaded) {
    setActiveClerkSession(session || null);
  }

  if (!isLoaded) return null;
  return getSupabaseClient();
}