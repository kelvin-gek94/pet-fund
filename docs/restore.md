# Restoring the Pet Fund from a backup

Use this only if the Supabase project is lost or corrupted. A backup is a
`pet-fund-backup-YYYY-MM-DD.zip` from `PETS\Pet Fund Backups`, containing
`data.json` (all tables) and `receipts/` (all photos).

## 1. Fresh project

1. Create a new Supabase project and run `supabase/schema.sql` (see `docs/setup.md` step 1).
   If you reuse the same project, skip this.
2. Redo Google sign-in (setup step 2) for the new project, and update `js/config.js` with the new
   Project URL + publishable key.

## 2. Load the data

Unzip the backup. In Supabase → SQL Editor → New query, paste the SQL below, then replace
`PASTE_DATA_JSON_HERE` with the **entire contents** of `data.json`, and Run.

```sql
create temp table backup_doc as select $json$PASTE_DATA_JSON_HERE$json$::jsonb as doc;

-- Remove the starter rows created by schema.sql
delete from public.transactions;
delete from public.upcoming;
delete from public.settings;
delete from public.categories;
delete from public.pets;
delete from public.members;

-- Keep original "added by / edited by" stamps
alter table public.transactions disable trigger transactions_audit;
alter table public.upcoming disable trigger upcoming_audit;

insert into public.members      select * from jsonb_populate_recordset(null::public.members,      (select doc->'tables'->'members'      from backup_doc));
insert into public.pets         select * from jsonb_populate_recordset(null::public.pets,         (select doc->'tables'->'pets'         from backup_doc));
insert into public.categories   select * from jsonb_populate_recordset(null::public.categories,   (select doc->'tables'->'categories'   from backup_doc));
insert into public.settings     select * from jsonb_populate_recordset(null::public.settings,     (select doc->'tables'->'settings'     from backup_doc));
insert into public.transactions select * from jsonb_populate_recordset(null::public.transactions, (select doc->'tables'->'transactions' from backup_doc));
insert into public.upcoming     select * from jsonb_populate_recordset(null::public.upcoming,     (select doc->'tables'->'upcoming'     from backup_doc));

alter table public.transactions enable trigger transactions_audit;
alter table public.upcoming enable trigger upcoming_audit;

select 'members' t, count(*) from public.members union all
select 'transactions', count(*) from public.transactions union all
select 'upcoming', count(*) from public.upcoming;
```

The counts at the end should match the number of rows in each list in `data.json`.

## 3. Put the receipts back

Supabase → **Storage → receipts**. The zip's `receipts/` folder contains year folders
(e.g. `2026/10/…jpg`). Upload each **year folder** into the bucket root so the paths stay
identical (`2026/10/<file>.jpg`). The app finds each photo by that path.

## 4. Check

Sign in to the app: Home figures, History and receipts should match what you had before.
