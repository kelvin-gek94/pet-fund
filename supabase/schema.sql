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
  deleted_at timestamptz,
  created_by uuid references public.members(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.members(id),
  updated_at timestamptz not null default now(),
  constraint contribution_shape check (type <> 'contribution' or (
    member_id is not null and pet_id is null and category_id is null
    and paid_by_member_id is null and reimbursed_on is null)),
  constraint expense_shape check (type <> 'expense' or (category_id is not null and member_id is null)),
  constraint reimbursed_only_claims check (reimbursed_on is null or paid_by_member_id is not null)
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

-- Audit stamps come from the signed-in user, never from the browser.
create or replace function public.stamp_audit() returns trigger
language plpgsql security definer set search_path = public as $$
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
