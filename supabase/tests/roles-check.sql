-- Checks the Admin / Member rules. Run in Supabase → SQL Editor.
-- It acts as Kelvin (admin) and Vincent (member), tries each action, then UNDOES EVERYTHING:
-- the script always ends with an error whose message is the results list — that error is expected
-- and is what rolls all the test changes back. Look for "ALL PASS" in the message.
do $$
declare
  out text := '';
  fails int := 0;
  n int;
  kelvin uuid := (select id from public.members where name = 'Kelvin');
  vincent uuid := (select id from public.members where name = 'Vincent');
  cat uuid := (select id from public.categories order by sort limit 1);
  admin_claims text := json_build_object('email', (select email from public.members where id = kelvin),
                         'app_metadata', json_build_object('providers', json_build_array('google')))::text;
  member_claims text := json_build_object('email', (select email from public.members where id = vincent),
                         'app_metadata', json_build_object('providers', json_build_array('google')))::text;
  k_txn uuid := gen_random_uuid();
  v_txn uuid := gen_random_uuid();
  v_claim uuid := gen_random_uuid();
begin
  if kelvin is null or vincent is null or (select email from public.members where id = vincent) is null then
    raise exception 'Setup problem: need an admin and a member named Vincent with an email.';
  end if;

  -- ── As Kelvin (admin): create an entry that Vincent must not be able to touch ──
  perform set_config('request.jwt.claims', admin_claims, true);
  execute 'set local role authenticated';
  insert into public.transactions (id, type, date, amount, member_id, note)
    values (k_txn, 'contribution', current_date, 1, kelvin, 'ROLE TEST');

  -- ── As Vincent (member) ──
  execute 'reset role';
  perform set_config('request.jwt.claims', member_claims, true);
  execute 'set local role authenticated';

  update public.settings set reserve_target = 123 where id = 1;
  get diagnostics n = row_count;
  out := out || format(E'\n%s member cannot change fund settings', case when n = 0 then 'PASS' else 'FAIL' end);
  fails := fails + (n <> 0)::int;

  update public.members set active = false where id = kelvin;
  get diagnostics n = row_count;
  out := out || format(E'\n%s member cannot change the family list', case when n = 0 then 'PASS' else 'FAIL' end);
  fails := fails + (n <> 0)::int;

  begin
    insert into public.members (name, email) values ('Intruder', 'x@example.com');
    out := out || E'\nFAIL member cannot add a family member'; fails := fails + 1;
  exception when others then out := out || E'\nPASS member cannot add a family member';
  end;

  update public.transactions set amount = 999 where id = k_txn;
  get diagnostics n = row_count;
  out := out || format(E'\n%s member cannot edit someone else''s entry', case when n = 0 then 'PASS' else 'FAIL' end);
  fails := fails + (n <> 0)::int;

  insert into public.transactions (id, type, date, amount, member_id, note)
    values (v_txn, 'contribution', current_date, 2, vincent, 'ROLE TEST');
  update public.transactions set amount = 3 where id = v_txn;
  get diagnostics n = row_count;
  out := out || format(E'\n%s member can add and edit their own entry', case when n = 1 then 'PASS' else 'FAIL' end);
  fails := fails + (n <> 1)::int;

  update public.transactions set deleted_at = now() where id = v_txn;
  get diagnostics n = row_count;
  out := out || format(E'\n%s member can delete their own entry', case when n = 1 then 'PASS' else 'FAIL' end);
  fails := fails + (n <> 1)::int;

  insert into public.transactions (id, type, date, amount, category_id, paid_by_member_id, note)
    values (v_claim, 'expense', current_date, 5, cat, vincent, 'ROLE TEST');
  begin
    update public.transactions set reimbursed_on = current_date where id = v_claim;
    out := out || E'\nFAIL member cannot mark a claim reimbursed'; fails := fails + 1;
  exception when others then out := out || E'\nPASS member cannot mark a claim reimbursed';
  end;

  begin
    insert into public.transactions (type, date, amount, category_id, paid_by_member_id, reimbursed_on, note)
      values ('expense', current_date, 5, cat, vincent, current_date, 'ROLE TEST');
    out := out || E'\nFAIL member cannot add an already-reimbursed claim'; fails := fails + 1;
  exception when others then out := out || E'\nPASS member cannot add an already-reimbursed claim';
  end;

  begin
    insert into public.upcoming (name, est_amount, category_id, frequency, next_due) values ('ROLE TEST', 1, cat, 'monthly', current_date);
    insert into public.pets (name) values ('ROLE TEST');
    out := out || E'\nPASS member can add upcoming costs and pets';
  exception when others then out := out || E'\nFAIL member can add upcoming costs and pets: ' || sqlerrm; fails := fails + 1;
  end;

  -- ── Back to Kelvin (admin) ──
  execute 'reset role';
  perform set_config('request.jwt.claims', admin_claims, true);
  execute 'set local role authenticated';

  update public.transactions set reimbursed_on = current_date where id = v_claim;
  get diagnostics n = row_count;
  out := out || format(E'\n%s admin can mark a claim reimbursed', case when n = 1 then 'PASS' else 'FAIL' end);
  fails := fails + (n <> 1)::int;

  update public.settings set reserve_target = reserve_target where id = 1;
  get diagnostics n = row_count;
  out := out || format(E'\n%s admin can change fund settings', case when n = 1 then 'PASS' else 'FAIL' end);
  fails := fails + (n <> 1)::int;

  update public.transactions set amount = 1 where id = k_txn;
  get diagnostics n = row_count;
  out := out || format(E'\n%s admin can edit any entry', case when n = 1 then 'PASS' else 'FAIL' end);
  fails := fails + (n <> 1)::int;

  execute 'reset role';
  raise exception '%', case when fails = 0 then 'ALL PASS' else fails || ' FAILED' end
    || out || E'\n(This error is expected: it undoes every test change.)';
end
$$;
