-- Run once in Supabase → SQL Editor. Adds "For month" to contributions (paying early or late).
alter table public.transactions add column if not exists for_month date;

-- Existing contributions count for the month they were transferred in.
alter table public.transactions disable trigger transactions_audit;   -- keep original "edited by" stamps
update public.transactions set for_month = date_trunc('month', date)::date
  where type = 'contribution' and for_month is null;
alter table public.transactions enable trigger transactions_audit;

alter table public.transactions drop constraint if exists for_month_shape;
alter table public.transactions add constraint for_month_shape check (
  (type = 'contribution' or for_month is null)
  and (for_month is null or extract(day from for_month) = 1));
