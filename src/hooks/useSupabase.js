import { useMemo } from 'react';
import { useSession } from '@clerk/clerk-react';
import { createClerkSupabaseClient } from '../lib/supabase.js';

/**
 * Hook that returns a Supabase client authenticated via the current Clerk session.
 * Returns `null` while the Clerk session is still loading.
 *
 * IMPORTANT: we memoize on session.id (not the session object itself) so the
 * client isn't recreated on every render — which would kill performance and
 * break realtime subscriptions.
 */
export function useSupabase() {
  const { session, isLoaded } = useSession();

  return useMemo(() => {
    if (!isLoaded) return null;
    return createClerkSupabaseClient(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, isLoaded]);
}
