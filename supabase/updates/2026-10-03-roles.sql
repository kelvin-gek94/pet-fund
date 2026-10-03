-- Run once in Supabase → SQL Editor. Adds Admin / Member roles. Safe to run more than once.
--
-- Members: add entries; edit/delete/restore only their OWN entries (until a claim is reimbursed);
--          manage upcoming costs, pets and categories.
-- Admin:   everything, including fund settings, the family list, marking claims reimbursed, backups.

alter table public.members add column if not exists role text not null default 'member';
alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('admin', 'member'));
update public.members set role = 'admin' where name = 'Kelvin';

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where id = public.current_member_id() and role = 'admin')
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Fund settings and the family list: admin only (everyone can still read them).
drop policy if exists "settings: members insert" on public.settings;
drop policy if exists "settings: members update" on public.settings;
drop policy if exists "settings: admin insert" on public.settings;
drop policy if exists "settings: admin update" on public.settings;
create policy "settings: admin insert" on public.settings for insert to authenticated with check (public.is_admin());
create policy "settings: admin update" on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "members: members insert" on public.members;
drop policy if exists "members: members update" on public.members;
drop policy if exists "members: admin insert" on public.members;
drop policy if exists "members: admin update" on public.members;
create policy "members: admin insert" on public.members for insert to authenticated with check (public.is_admin());
create policy "members: admin update" on public.members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Entries: members may only add unreimbursed entries, and change only their own unreimbursed ones.
drop policy if exists "transactions: members insert" on public.transactions;
drop policy if exists "transactions: members update" on public.transactions;
drop policy if exists "transactions: insert" on public.transactions;
drop policy if exists "transactions: own or admin update" on public.transactions;
create policy "transactions: insert" on public.transactions for insert to authenticated
  with check (public.is_member() and (public.is_admin() or reimbursed_on is null));
create policy "transactions: own or admin update" on public.transactions for update to authenticated
  using (public.is_member() and (public.is_admin() or (created_by = public.current_member_id() and reimbursed_on is null)))
  with check (public.is_member() and (public.is_admin() or (created_by = public.current_member_id() and reimbursed_on is null)));

select name, role from public.members order by sort;
