-- Run once in Supabase → SQL Editor. Safe to run more than once.
-- The membership helpers are only needed by signed-in users; anonymous visitors don't get to call them.
revoke execute on function public.current_member_id() from public, anon;
revoke execute on function public.is_member() from public, anon;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.is_member() to authenticated;
-- The audit trigger doesn't need elevated rights; current_member_id() already has them.
alter function public.stamp_audit() security invoker;
