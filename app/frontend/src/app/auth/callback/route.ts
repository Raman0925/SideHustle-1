import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Route Handler: GET /auth/callback
 * Exchanges the OAuth authorization code for a session token using PKCE.
 * Implements security checks against Open Redirect vulnerabilities.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Security Check: Mitigate Open Redirect attacks.
  // Validate that the redirect path starts with a single '/' and not '//' (which browsers could parse as a protocol-relative external redirect).
  const isSafeRedirect = next.startsWith('/') && !next.startsWith('//');
  const safeRedirectPath = isSafeRedirect ? next : '/';

  if (code) {
    try {
      const supabase = await createClient();

      // Exchanges the authorization code (part of the PKCE flow) for a session token.
      // This sets the HTTP-only cookies securely in the background.
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error) {
        return NextResponse.redirect(`${origin}${safeRedirectPath}`);
      }

      // Log the internal error safely on the server side
      console.error('Auth Callback Error during exchange:', error.message);
    } catch (err) {
      console.error('Unexpected error in Auth Callback route:', err);
    }
  }

  // Fallback: Redirect to an error page if code is missing or exchange failed
  return NextResponse.redirect(`${origin}/?error=auth-code-error`);
}
