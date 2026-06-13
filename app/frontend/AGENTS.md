<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:supabase-agent-rules -->

# Supabase Integration Rules

Avoid deprecated and insecure integration patterns. Follow these standards:

1. **Use `@supabase/ssr` instead of `@supabase/auth-helpers-nextjs`**: The auth-helpers library is deprecated. Always use `@supabase/ssr` for Next.js App Router integrations.
2. **Use `getAll()` and `setAll()` for Server Cookies**: In `@supabase/ssr`, configuring separate `get`, `set`, and `remove` functions inside `createServerClient` is deprecated. Always configure the cookies option using the newer bulk operations:
   ```typescript
   cookies: {
     getAll() { return cookieStore.getAll(); },
     setAll(cookiesToSet) { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
   }
   ```
3. **Never use `auth.getSession()` for Server Authorization**: `getSession()` is insecure on the server side because it trusts the cookie's JWT without verifying it with Supabase. Always use `supabase.auth.getUser()` to securely fetch and verify the user.
4. **Isolate Service Role Key**: Never expose `SUPABASE_SERVICE_ROLE_KEY` (or any key not prefixed with `NEXT_PUBLIC_`) to the client components.
<!-- END:supabase-agent-rules -->
