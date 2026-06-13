-- Create profiles table in the public schema
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS) to prevent unauthorized access
alter table public.profiles enable row level security;

-- Setup RLS Policies
-- Everyone is permitted to view user profiles (e.g., for user list or forum avatar references)
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using ( true );

-- Users are only allowed to modify their own profile record
create policy "Users can update their own profile"
  on public.profiles for update
  using ( (select auth.uid()) = id );

-- Create trigger function to sync user creation
-- SECURITY DEFINER runs the function with superuser permissions, allowing writes to the public.profiles table.
-- search_path is set to 'public' to prevent search path hijacking vulnerabilities.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  metadata jsonb := new.raw_user_meta_data;
  profile_email text;
  profile_name text;
  profile_avatar text;
begin
  -- Safely extract user metadata, handling missing/null fields gracefully
  if metadata is not null then
    profile_email := coalesce(metadata->>'email', new.email);
    profile_name := coalesce(metadata->>'full_name', metadata->>'name');
    profile_avatar := metadata->>'avatar_url';
  else
    profile_email := new.email;
  end if;

  -- Upsert values to prevent duplicate key constraint crashes on re-authentication linking
  insert into public.profiles (id, email, full_name, avatar_url, updated_at)
  values (
    new.id,
    profile_email,
    profile_name,
    profile_avatar,
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();

  return new;
end;
$$;

-- Create trigger that runs handle_new_user every time a new row is added to auth.users
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
