import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';

/**
 * Creates a browser-side Supabase client.
 * Named explicitly to prevent developer import errors in server contexts.
 */
export function createBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Supabase client-side environment variables are missing.');
  }

  return createSupabaseBrowserClient(supabaseUrl, supabasePublishableKey);
}
