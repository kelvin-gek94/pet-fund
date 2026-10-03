-- Run once in Supabase → SQL Editor on projects created before 2026-10-03.
-- Members must have signed in with Google; an email/password account with a member's address is not enough.
create or replace function public.current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.members
  where active and email is not null and lower(email) = lower(auth.jwt() ->> 'email')
    and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
  limit 1
$$;
