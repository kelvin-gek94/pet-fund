// Pure fund calculations. Every function ignores soft-deleted rows.
import { sumCents } from './money.js';
import { monthKey, previousMonths, addDays, addMonthsClamped } from './dates.js';

const live = txns => txns.filter(t => !t.deleted_at);
const expenses = txns => live(txns).filter(t => t.type === 'expense');
const contributions = txns => live(txns).filter(t => t.type === 'contribution');
const isClaim = t => t.type === 'expense' && t.paid_by_member_id != null;

export function cashInFund(txns, openingCents) {
  const inflow = sumCents(contributions(txns).map(t => t.amount_cents));
  // Money leaves the fund when the Fund pays, or when a claim is reimbursed.
  const outflow = sumCents(expenses(txns)
    .filter(t => !isClaim(t) || t.reimbursed_on)
    .map(t => t.amount_cents));
  return openingCents + inflow - outflow;
}

export function pendingClaims(txns) {
  const byMember = new Map();
  for (const t of expenses(txns)) {
    if (!isClaim(t) || t.reimbursed_on) continue;
    const c = byMember.get(t.paid_by_member_id)
      ?? { member_id: t.paid_by_member_id, total_cents: 0, count: 0, oldest_date: t.date };
    c.total_cents += t.amount_cents;
    c.count += 1;
    if (t.date < c.oldest_date) c.oldest_date = t.date;
    byMember.set(t.paid_by_member_id, c);
  }
  return [...byMember.values()].sort((a, b) => b.total_cents - a.total_cents);
}

export function availableCents(txns, openingCents) {
  return cashInFund(txns, openingCents) - sumCents(pendingClaims(txns).map(c => c.total_cents));
}

export function spendInMonth(txns, month) {
  return sumCents(expenses(txns).filter(t => monthKey(t.date) === month).map(t => t.amount_cents));
}

export function avgMonthlySpend(txns, today) {
  const rows = live(txns);
  if (!rows.length) return 0;
  const firstMonth = rows.reduce((m, t) => (monthKey(t.date) < m ? monthKey(t.date) : m), monthKey(rows[0].date));
  const months = previousMonths(today, 3).filter(m => m >= firstMonth);
  if (!months.length) return spendInMonth(txns, monthKey(today));
  return Math.round(sumCents(months.map(m => spendInMonth(txns, m))) / months.length);
}

export function runway(availableCents, reserveCents, avgCents) {
  const belowReserve = availableCents < reserveCents;
  if (avgCents <= 0) return { months: belowReserve ? 0 : null, belowReserve };
  const months = Math.max(0, (availableCents - reserveCents) / avgCents);
  return { months: Math.round(months * 10) / 10, belowReserve };
}

// The month a contribution is "for" (siblings may pay early or late); older rows fall back to the transfer month.
export const fundMonth = t => monthKey(t.for_month ?? t.date);

export function contributionsInMonth(txns, members, month) {
  const rows = contributions(txns).filter(t => fundMonth(t) === month);
  return members.filter(m => m.active).map(m => ({
    member_id: m.id,
    name: m.name,
    total_cents: sumCents(rows.filter(t => t.member_id === m.id).map(t => t.amount_cents)),
  }));
}

export function dueSoon(upcoming, today, days = 7) {
  const limit = addDays(today, days);
  return upcoming
    .filter(u => u.active && u.next_due <= limit)
    .map(u => ({ ...u, overdue: u.next_due < today }))
    .sort((a, b) => a.next_due.localeCompare(b.next_due));
}

export function nextDueAfterPaid(item) {
  const step = { monthly: 1, yearly: 12, every_n_months: item.every_n }[item.frequency];
  return addMonthsClamped(item.next_due, step);
}

export function spendBy(txns, field, from, to) {
  const out = new Map();
  for (const t of expenses(txns)) {
    if (t.date < from || t.date > to) continue;
    const key = t[field] ?? null;
    out.set(key, (out.get(key) ?? 0) + t.amount_cents);
  }
  return out;
}

export function inOutByMonth(txns, fromMonth, toMonth) {
  const out = [];
  for (let m = fromMonth; m <= toMonth; m = monthKey(addMonthsClamped(`${m}-01`, 1))) {
    out.push({
      month: m,
      in_cents: sumCents(contributions(txns).filter(t => monthKey(t.date) === m).map(t => t.amount_cents)),
      out_cents: spendInMonth(txns, m),
    });
  }
  return out;
}

// Days since the last backup when the admin should be reminded (Infinity = never backed up), else null.
const BACKUP_EVERY_DAYS = 7;
export function backupReminderDays(settings, me, now = new Date()) {
  if (me?.role !== 'admin') return null;
  if (!settings.last_backup_at) return Infinity;
  const days = Math.floor((now - new Date(settings.last_backup_at)) / 86400000);
  return days > BACKUP_EVERY_DAYS ? days : null;
}

// Contributions already received for months after the current one.
export function paidAhead(txns, members, today) {
  const now = monthKey(today);
  const out = new Map();
  for (const t of contributions(txns)) {
    const month = fundMonth(t);
    if (month <= now) continue;
    const key = `${t.member_id}|${month}`;
    const row = out.get(key)
      ?? { member_id: t.member_id, name: members.find(m => m.id === t.member_id)?.name ?? '?', month, total_cents: 0 };
    row.total_cents += t.amount_cents;
    out.set(key, row);
  }
  return [...out.values()].sort((a, b) => a.month.localeCompare(b.month) || a.name.localeCompare(b.name));
}

// "For month" choices on the Add form: last month, this month, and the next two.
export function forMonthOptions(today) {
  const first = `${monthKey(today)}-01`;
  return [-1, 0, 1, 2].map(n => monthKey(addMonthsClamped(first, n)));
}

// Default "For month": this month, unless this sibling already paid it — then the next unpaid one.
export function defaultForMonth(txns, memberId, today) {
  const paid = new Set(contributions(txns).filter(t => t.member_id === memberId).map(fundMonth));
  const [, ...upcoming] = forMonthOptions(today);
  return upcoming.find(m => !paid.has(m)) ?? upcoming.at(-1);
}
