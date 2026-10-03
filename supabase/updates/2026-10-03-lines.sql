-- Run once in Supabase → SQL Editor. Receipt lines, several pets per line, Need / Want categories.
-- Safe to run more than once.

-- Need / Want on categories (anything unlabelled is a Need).
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

-- Existing expenses become one line each (keeping their original "edited by" stamps).
alter table public.transactions disable trigger transactions_audit;
update public.transactions
  set lines = jsonb_build_array(jsonb_build_object(
    'category_id', category_id,
    'pet_ids', case when pet_id is null then '[]'::jsonb else jsonb_build_array(pet_id) end,
    'amount', amount))
  where type = 'expense' and lines is null;
alter table public.transactions enable trigger transactions_audit;

-- Lines only on expenses, at least one, and they must add up to the expense total.
alter table public.transactions drop constraint if exists lines_shape;
alter table public.transactions add constraint lines_shape check (
  lines is null or (
    type = 'expense' and jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0
    and public.lines_total(lines) = amount));

select
  (select count(*) from public.transactions where type = 'expense' and lines is not null) as expenses_with_lines,
  (select count(*) from public.transactions where type = 'expense' and lines is null) as expenses_without_lines,
  (select string_agg(name || '=' || kind, ', ' order by sort) from public.categories) as categories;
