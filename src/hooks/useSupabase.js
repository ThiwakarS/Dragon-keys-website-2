import { useEffect } from 'react';
import { useSession } from '@clerk/clerk-react';
import { getSupabaseClient, setActiveClerkSession } from '../lib/supabase.js';
 
/**
 * Hook that returns the singleton Supabase client, and keeps its
 * accessToken callback in sync with the current Clerk session.
 *
 * CRITICAL: we no longer create a new client per session. That caused
 * multiple GoTrueClient instances which caused reads to sometimes
 * fall through as anon role (which couldn't see the user's own orders).
 */
export function useSupabase() {
  const { session, isLoaded } = useSession();
 
  useEffect(() => {
    if (isLoaded) setActiveClerkSession(session || null);
  }, [session, isLoaded]);
 
  if (!isLoaded) return null;
  return getSupabaseClient();
}