// Every Supabase call lives here. Amounts become *_cents on the way in and RM on the way out.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { toCents, fromCents } from './money.js';
import { fetchAllPages } from './paging.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const RECEIPTS = 'receipts';
const SIGNED_URL_SECONDS = 600;
const AUDIT = ['created_by', 'created_at', 'updated_by', 'updated_at'];

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// ───── Auth ─────

export function signInWithGoogle() {
  return sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname },
  });
}

export const signOut = () => sb.auth.signOut();

export async function getSession() {
  return (await sb.auth.getSession()).data.session;
}

export function onAuth(cb) {
  sb.auth.onAuthStateChange((_event, session) => cb(session));
}

// ───── Row converters ─────

const txnIn = r => ({ ...r, amount_cents: toCents(r.amount) });
const upcomingIn = r => ({ ...r, est_amount_cents: toCents(r.est_amount) });
const settingsIn = r => ({
  ...r,
  opening_balance_cents: toCents(r.opening_balance),
  reserve_target_cents: toCents(r.reserve_target),
});

function strip(row, extra = []) {
  const out = { ...row };
  for (const k of [...AUDIT, ...extra]) delete out[k];
  return out;
}

// ───── Load ─────

export async function loadAll(session) {
  const [members, pets, categories, txns, upcoming, settings] = await Promise.all([
    sb.from('members').select('*').order('sort').order('name').then(check),
    sb.from('pets').select('*').order('sort').order('name').then(check),
    sb.from('categories').select('*').order('sort').order('name').then(check),
    fetchAllPages(async (from, to) => check(await sb.from('transactions').select('*')
      .order('date', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to))),
    sb.from('upcoming').select('*').order('next_due').then(check),
    sb.from('settings').select('*').eq('id', 1).maybeSingle().then(check),
  ]);
  const email = session?.user?.email?.toLowerCase();
  return {
    members,
    pets,
    categories,
    txns: txns.map(txnIn),
    upcoming: upcoming.map(upcomingIn),
    settings: settings ? settingsIn(settings) : { opening_balance_cents: 0, reserve_target_cents: 0 },
    me: members.find(m => m.active && m.email?.toLowerCase() === email) ?? null,
  };
}

// ───── Transactions ─────

export async function saveTxn(txn) {
  const row = strip(txn, ['amount_cents']);
  row.amount = fromCents(txn.amount_cents);
  if (!row.id) row.id = crypto.randomUUID();
  const data = check(await sb.from('transactions').upsert(row).select().single());
  return txnIn(data);
}

export async function softDelete(id) {
  check(await sb.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id));
}

export async function restore(id) {
  check(await sb.from('transactions').update({ deleted_at: null }).eq('id', id));
}

export async function markReimbursed(id, date) {
  check(await sb.from('transactions').update({ reimbursed_on: date }).eq('id', id));
}

// ───── Upcoming, settings, lists ─────

export async function saveUpcoming(item) {
  const row = strip(item, ['est_amount_cents', 'overdue']);
  row.est_amount = fromCents(item.est_amount_cents ?? 0);
  return upcomingIn(check(await sb.from('upcoming').upsert(row).select().single()));
}

export async function saveSettings(patch) {
  const row = { ...patch };
  if ('opening_balance_cents' in row) { row.opening_balance = fromCents(row.opening_balance_cents); delete row.opening_balance_cents; }
  if ('reserve_target_cents' in row) { row.reserve_target = fromCents(row.reserve_target_cents); delete row.reserve_target_cents; }
  check(await sb.from('settings').update(row).eq('id', 1));
}

const saveRow = table => async row => check(await sb.from(table).upsert(row).select().single());
export const saveMember = saveRow('members');
export const savePet = saveRow('pets');
export const saveCategory = saveRow('categories');

// ───── Receipts ─────

export async function uploadReceipt(blob, txnId) {
  const now = new Date();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${txnId}-${rand}.jpg`;
  check(await sb.storage.from(RECEIPTS).upload(path, blob, { contentType: 'image/jpeg' }));
  return path;
}

export async function receiptUrl(path) {
  return check(await sb.storage.from(RECEIPTS).createSignedUrl(path, SIGNED_URL_SECONDS)).signedUrl;
}

// ───── Backup ─────

export const BACKUP_TABLES = ['members', 'pets', 'categories', 'transactions', 'upcoming', 'settings'];

// Raw rows exactly as stored (amounts in RM), including soft-deleted transactions.
export async function exportTables() {
  const out = {};
  for (const t of BACKUP_TABLES) {
    out[t] = await fetchAllPages(async (from, to) => check(await sb.from(t).select('*').order('id').range(from, to)));
  }
  return out;
}
