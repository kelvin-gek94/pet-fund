// Who may do what. The database enforces the same rules (supabase/updates/2026-10-03-roles.sql);
// these only decide which buttons to show.

export const isAdmin = me => me?.role === 'admin';

// Members may change their own entries until a claim has been reimbursed; the admin may change any.
export function canEditTxn(t, me) {
  if (isAdmin(me)) return true;
  return !!me && t.created_by === me.id && !t.reimbursed_on;
}
