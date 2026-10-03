import { test, assertEqual, assertDeep } from './harness.js';
import {
  cashInFund, pendingClaims, availableCents, spendInMonth, avgMonthlySpend, runway,
  contributionsInMonth, dueSoon, nextDueAfterPaid, spendBy, inOutByMonth, backupReminderDays,
  paidAhead, forMonthOptions, defaultForMonth,
} from '../js/calc.js';

const members = ['Kelvin', 'Vincent', 'Desmond', 'Jolyn', 'Dickson']
  .map(name => ({ id: name.toLowerCase(), name, email: null, active: true }));

const base = {
  member_id: null, pet_id: null, category_id: null, paid_to: null, note: null, receipt_path: null,
  paid_by_member_id: null, reimbursed_on: null, deleted_at: null,
};
const T = [
  { ...base, id: 't1', type: 'contribution', date: '2026-09-05', amount_cents: 20000, member_id: 'kelvin' },
  { ...base, id: 't2', type: 'contribution', date: '2026-10-01', amount_cents: 15000, member_id: 'vincent' },
  { ...base, id: 't3', type: 'expense', date: '2026-09-10', amount_cents: 5000, category_id: 'vet', pet_id: 'mochi' },
  // Claim crossing months: spent 28 Sep by Jolyn, reimbursed 3 Oct
  { ...base, id: 't4', type: 'expense', date: '2026-09-28', amount_cents: 12000, category_id: 'food',
    paid_by_member_id: 'jolyn', reimbursed_on: '2026-10-03' },
  { ...base, id: 't5', type: 'expense', date: '2026-10-02', amount_cents: 3000, category_id: 'food',
    paid_by_member_id: 'desmond' },
  { ...base, id: 't6', type: 'contribution', date: '2026-06-01', amount_cents: 99999, member_id: 'kelvin',
    deleted_at: '2026-10-01T00:00:00Z' },
];

test('cashInFund: claim reduces cash only once reimbursed; deleted ignored', () => {
  assertEqual(cashInFund(T, 10000), 28000);
});

test('pendingClaims groups unreimbursed claims', () => {
  assertDeep(pendingClaims(T).map(c => [c.member_id, c.total_cents, c.count, c.oldest_date]),
    [['desmond', 3000, 1, '2026-10-02']]);
});

test('availableCents = cash - pending', () => assertEqual(availableCents(T, 10000), 25000));

test('spendInMonth counts claims on expense date', () => {
  assertEqual(spendInMonth(T, '2026-09'), 17000);
  assertEqual(spendInMonth(T, '2026-10'), 3000);
});

test('runway', () => {
  assertDeep(runway(25000, 20000, 10000), { months: 0.5, belowReserve: false });
  assertDeep(runway(15000, 20000, 10000), { months: 0, belowReserve: true });
  assertDeep(runway(25000, 0, 0), { months: null, belowReserve: false });
});

test('avgMonthlySpend: fresh start uses only months since first entry', () => {
  assertEqual(avgMonthlySpend(T, '2026-10-03'), 17000);
});

test('avgMonthlySpend: no complete month yet uses current month to date', () => {
  assertEqual(avgMonthlySpend(T.filter(t => t.date >= '2026-10-01'), '2026-10-03'), 3000);
});

test('avgMonthlySpend: empty data is 0', () => assertEqual(avgMonthlySpend([], '2026-10-03'), 0));

test('contributionsInMonth lists every active member in order', () => {
  assertDeep(contributionsInMonth(T, members, '2026-10').map(c => [c.name, c.total_cents]),
    [['Kelvin', 0], ['Vincent', 15000], ['Desmond', 0], ['Jolyn', 0], ['Dickson', 0]]);
});

test('dueSoon: 7-day window, overdue flagged, sorted', () => {
  const up = [
    { id: 'a', next_due: '2026-10-10', active: true },
    { id: 'b', next_due: '2026-10-01', active: true },
    { id: 'c', next_due: '2026-10-11', active: true },
    { id: 'd', next_due: '2026-09-01', active: false },
  ];
  assertDeep(dueSoon(up, '2026-10-03').map(u => [u.id, u.overdue]), [['b', true], ['a', false]]);
});

test('nextDueAfterPaid by frequency', () => {
  assertEqual(nextDueAfterPaid({ frequency: 'every_n_months', every_n: 3, next_due: '2026-11-30' }), '2027-02-28');
  assertEqual(nextDueAfterPaid({ frequency: 'monthly', next_due: '2026-01-31' }), '2026-02-28');
  assertEqual(nextDueAfterPaid({ frequency: 'yearly', next_due: '2026-10-12' }), '2027-10-12');
});

test('spendBy category and pet (null = All pets)', () => {
  assertDeep([...spendBy(T, 'category_id', '2026-09-01', '2026-09-30')], [['vet', 5000], ['food', 12000]]);
  assertDeep([...spendBy(T, 'pet_id', '2026-09-01', '2026-09-30')], [['mochi', 5000], [null, 12000]]);
});

test('inOutByMonth', () => {
  assertDeep(inOutByMonth(T, '2026-09', '2026-10'), [
    { month: '2026-09', in_cents: 20000, out_cents: 17000 },
    { month: '2026-10', in_cents: 15000, out_cents: 3000 },
  ]);
});

test('backupReminderDays: only Kelvin, null or > 7 days', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const kelvin = { name: 'Kelvin' };
  assertEqual(backupReminderDays({ last_backup_at: null }, kelvin, now), Infinity);
  assertEqual(backupReminderDays({ last_backup_at: '2026-10-02T12:00:00Z' }, kelvin, now), 8);
  assertEqual(backupReminderDays({ last_backup_at: '2026-10-04T12:00:00Z' }, kelvin, now), null);
  assertEqual(backupReminderDays({ last_backup_at: null }, { name: 'Jolyn' }, now), null);
});

test('runway: no spending yet but below reserve shows 0, not —', () => {
  assertDeep(runway(5000, 20000, 0), { months: 0, belowReserve: true });
});

// ── For month (paying early / late) ──
const early = [
  { ...base, id: 'e1', type: 'contribution', date: '2026-10-05', amount_cents: 20000, member_id: 'kelvin', for_month: '2026-10-01' },
  { ...base, id: 'e2', type: 'contribution', date: '2026-10-15', amount_cents: 15000, member_id: 'vincent', for_month: '2026-11-01' },
  { ...base, id: 'e3', type: 'contribution', date: '2026-10-02', amount_cents: 10000, member_id: 'jolyn', for_month: '2026-09-01' },
  { ...base, id: 'e4', type: 'contribution', date: '2026-10-03', amount_cents: 5000, member_id: 'dickson' }, // no for_month (older app)
];

test('contributionsInMonth follows for_month, falling back to the transfer month', () => {
  assertDeep(contributionsInMonth(early, members, '2026-10').map(c => [c.name, c.total_cents]),
    [['Kelvin', 20000], ['Vincent', 0], ['Desmond', 0], ['Jolyn', 0], ['Dickson', 5000]]);
  assertEqual(contributionsInMonth(early, members, '2026-11').find(c => c.name === 'Vincent').total_cents, 15000);
  assertEqual(contributionsInMonth(early, members, '2026-09').find(c => c.name === 'Jolyn').total_cents, 10000);
});

test('cash still counts early payments on the transfer date', () => assertEqual(cashInFund(early, 0), 50000));

test('paidAhead lists contributions for future months', () => {
  assertDeep(paidAhead(early, members, '2026-10-20'), [{ member_id: 'vincent', name: 'Vincent', month: '2026-11', total_cents: 15000 }]);
});

test('forMonthOptions: last month, this month, next two', () => {
  assertDeep(forMonthOptions('2026-12-20'), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('defaultForMonth: this month, or the next unpaid month', () => {
  assertEqual(defaultForMonth(early, 'desmond', '2026-10-20'), '2026-10');
  assertEqual(defaultForMonth(early, 'kelvin', '2026-10-20'), '2026-11');
  assertEqual(defaultForMonth(early, 'vincent', '2026-10-20'), '2026-10');
  const both = [...early, { ...base, id: 'e5', type: 'contribution', date: '2026-10-21', amount_cents: 100, member_id: 'kelvin', for_month: '2026-11-01' }];
  assertEqual(defaultForMonth(both, 'kelvin', '2026-10-21'), '2026-12');
});
