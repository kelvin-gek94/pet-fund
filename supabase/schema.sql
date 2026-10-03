-- Pet Fund Cash Flow Tracker — database setup.
-- Paste the whole file into Supabase → SQL Editor → Run, ONCE, on a fresh project.
-- Member emails are NOT set here (this repo is public). See docs/setup.md step 3.

-- ───────────── Tables ─────────────

create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,                      -- null = contributor who cannot sign in
  active boolean not null default true,
  sort int not null default 0
);

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort int not null default 0
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sort int not null default 0
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('contribution', 'expense')),
  date date not null,
  amount numeric(12,2) not null check (amount > 0),
  member_id uuid references public.members(id),
  pet_id uuid references public.pets(id),            -- null = All pets
  category_id uuid references public.categories(id),
  paid_to text,
  note text,
  receipt_path text,
  paid_by_member_id uuid references public.members(id), -- null = paid by Fund
  reimbursed_on date,
  for_month date,                                      -- contributions: the month it is for (1st of month)
  deleted_at timestamptz,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.members(id),
  updated_at timestamptz not null default now(),
  constraint contribution_shape check (type <> 'contribution' or (
    member_id is not null and pet_id is null and category_id is null
    and paid_by_member_id is null and reimbursed_on is null)),
  constraint expense_shape check (type <> 'expense' or (category_id is not null and member_id is null)),
  constraint reimbursed_only_claims check (reimbursed_on is null or paid_by_member_id is not null),
  constraint for_month_shape check (
    (type = 'contribution' or for_month is null)
    and (for_month is null or extract(day from for_month) = 1))
);
create index transactions_date_idx on public.transactions (date);

create table public.upcoming (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  est_amount numeric(12,2) not null default 0 check (est_amount >= 0),
  pet_id uuid references public.pets(id),
  category_id uuid not null references public.categories(id),
  frequency text not null check (frequency in ('monthly', 'every_n_months', 'yearly')),
  every_n int check (every_n is null or every_n >= 1),
  next_due date not null,
  active boolean not null default true,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.members(id),
  updated_at timestamptz not null default now(),
  constraint every_n_needed check (frequency <> 'every_n_months' or every_n is not null)
);

create table public.settings (
  id int primary key default 1 check (id = 1),
  opening_balance numeric(12,2) not null default 0,
  reserve_target numeric(12,2) not null default 0 check (reserve_target >= 0),
  last_backup_at timestamptz,
  last_backup_by uuid references public.members(id)
);

-- ───────────── Who is allowed in ─────────────

create or replace function public.current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.members
  where active and email is not null and lower(email) = lower(auth.jwt() ->> 'email')
    -- Only Google sign-ins count, even if email/password sign-up is ever switched back on.
    and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
  limit 1
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_member_id() is not null
$$;

revoke execute on function public.current_member_id() from public, anon;
revoke execute on function public.is_member() from public, anon;
grant execute on function public.current_member_id() to authenticated;
grant execute on function public.is_member() to authenticated;

-- Audit stamps come from the signed-in user, never from the browser.
create or replace function public.stamp_audit() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := public.current_member_id();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := public.current_member_id();
  new.updated_at := now();
  return new;
end
$$;

create trigger transactions_audit before insert or update on public.transactions
  for each row execute function public.stamp_audit();
create trigger upcoming_audit before insert or update on public.upcoming
  for each row execute function public.stamp_audit();

-- ───────────── Row Level Security ─────────────
-- Members may read, add and edit. Nobody may hard-delete (soft delete only).

do $$
declare t text;
begin
  foreach t in array array['members', 'pets', 'categories', 'transactions', 'upcoming', 'settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members read" on public.%I for select to authenticated using (public.is_member())', t, t);
    execute format('create policy "%s: members insert" on public.%I for insert to authenticated with check (public.is_member())', t, t);
    execute format('create policy "%s: members update" on public.%I for update to authenticated using (public.is_member()) with check (public.is_member())', t, t);
    execute format('revoke delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end
$$;

-- ───────────── Keep-alive ─────────────
-- Called every 3 days by GitHub Actions. Reads no tables.

create or replace function public.ping() returns text
language sql stable as $$ select 'ok'::text $$;
grant execute on function public.ping() to anon;

-- ───────────── Receipt storage (private) ─────────────

insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts: members read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_member());
create policy "receipts: members upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_member());
create policy "receipts: members update" on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and public.is_member());

-- ───────────── Starting data ─────────────

insert into public.members (name, sort) values
  ('Kelvin', 1), ('Vincent', 2), ('Desmond', 3), ('Jolyn', 4), ('Dickson', 5);

insert into public.pets (name, sort) values
  ('Murphy', 1), ('Panda', 2), ('Watson', 3), ('Mochi', 4), ('Poppy', 5);

insert into public.categories (name, sort) values
  ('Food', 1), ('Vet', 2), ('Grooming', 3), ('Medication', 4), ('Supplies', 5), ('Insurance', 6), ('Other', 7);

insert into public.settings (id) values (1);

-- ───────────── Roles (Admin / Member) ─────────────
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

-- ───────────── Receipt lines and Need / Want ─────────────
alter table public.categories add column if not exists kind text not null default 'need';
alter table public.categories drop constraint if exists categories_kind_check;
alter table public.categories add constraint categories_kind_check check (kind in ('need', 'want'));
insert into public.categories (name, kind, sort)
  select v.name, 'want', v.sort from (values ('Treats', 8), ('Toys', 9)) as v(name, sort)
  where not exists (select 1 from public.categories c where lower(c.name) = lower(v.name));

-- Lines on expenses: [{ "category_id": uuid, "pet_ids": [uuid…] (empty = All pets), "amount": 12.30 }, …]
alter table public.transactions add column if not exists lines jsonb;

create or replace function public.lines_total(lines jsonb) returns numeric
language sql immutable as $$
  select coalesce(sum((l ->> 'amount')::numeric), 0) from jsonb_array_elements(lines) as l
$$;
alter table public.transactions drop constraint if exists lines_shape;
alter table public.transactions add constraint lines_shape check (
  lines is null or (
    type = 'expense' and jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0
    and public.lines_total(lines) = amount));
