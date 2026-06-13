# Supabase Integration Skills & Best Practices

This document outlines the standard, modern integration rules for Supabase in this repository. Avoid deprecated helpers and insecure patterns.

---

## 1. Library Selection
*   **Do NOT use `@supabase/auth-helpers-nextjs`**: It is officially deprecated.
*   **DO use `@supabase/ssr`**: Use this modern package for session and cookie handling in Next.js App Router.

---

## 2. Server-Side Client Creation
When configuring `createServerClient` in route handlers, Server Components, or middleware, always define the bulk `getAll` and `setAll` cookie methods. Do not use deprecated single-cookie `get`, `set`, and `remove` methods.

### TypeScript-Safe Server Client Pattern:
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options: any;
          }>
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Safe to ignore if called from a Server Component.
            // Actual session refresh is performed by Middleware.
          }
        },
      },
    }
  );
}
```

---

## 3. Server Authorization checks
*   **Do NOT use `supabase.auth.getSession()` on the server**: The session returned is read from cookies and can be easily spoofed on the client.
*   **DO use `supabase.auth.getClaims()`**: For proxy/middleware checks, use `getClaims()` which verifies the JWT signature locally against cached public keys (JWKS) without making external network calls, providing optimal performance. Alternatively, use `supabase.auth.getUser()`.

---

## 4. Key Management & RLS
*   **`NEXT_PUBLIC_SUPABASE_URL`** and **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** are safe for client-side inclusion (prefixed for Next.js).
*   **`SUPABASE_SERVICE_ROLE_KEY`** must **NEVER** be prefixed or exposed to the client. It bypasses Row Level Security (RLS) entirely.

---

## 5. PostgreSQL Sync Triggers (Security Definer)
When writing migrations for triggers that copy auth details to public profiles:
1.  Always configure the trigger function as `SECURITY DEFINER` (so it runs with database administrator privileges to write into public schemas).
2.  **Explicitly set the `search_path`** to `public` to prevent Search Path Hijacking (exploits using maliciously named functions/tables in other schemas).
3.  Handle null values in OAuth payloads gracefully using `coalesce` (e.g., if a user has no name or profile image).

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;
```
