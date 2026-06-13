import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Creates a server-side Supabase client.
 * Uses HTTP-only cookie storage for secure session token persistence.
 * Leverages the async cookies API matching Next.js 16 conventions.
 */
export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase server-side environment variables are missing.');
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Note: The setAll method can be called from a Server Component.
          // In Next.js, setting cookies from a Server Component will throw.
          // This is expected and safe, as the middleware (middleware.ts)
          // handles the actual token refresh on requests.
        }
      },
    },
  });
}
