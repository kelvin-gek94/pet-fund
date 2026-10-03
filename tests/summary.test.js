import { test, assert, assertEqual } from './harness.js';
import { buildSummary, summaryText } from '../js/summary.js';

const members = ['Kelvin', 'Vincent', 'Desmond', 'Jolyn', 'Dickson']
  .map(name => ({ id: name.toLowerCase(), name, email: null, active: true }));
const pets = ['Murphy', 'Panda', 'Watson', 'Mochi', 'Poppy']
  .map(name => ({ id: name.toLowerCase(), name, active: true }));
const categories = [{ id: 'vet', name: 'Vet', active: true }, { id: 'food', name: 'Food', active: true }];
const base = {
  member_id: null, pet_id: null, category_id: null, paid_to: null, note: null, receipt_path: null,
  paid_by_member_id: null, reimbursed_on: null, deleted_at: null,
};
const txns = [
  { ...base, id: 'a', type: 'contribution', date: '2026-10-01', amount_cents: 20000, member_id: 'kelvin' },
  { ...base, id: 'b', type: 'contribution', date: '2026-10-02', amount_cents: 15000, member_id: 'vincent' },
  { ...base, id: 'c', type: 'contribution', date: '2026-10-02', amount_cents: 20000, member_id: 'jolyn' },
  { ...base, id: 'd', type: 'expense', date: '2026-10-02', amount_cents: 52000, category_id: 'vet', pet_id: 'mochi' },
  { ...base, id: 'e', type: 'expense', date: '2026-10-03', amount_cents: 12000, category_id: 'food',
    paid_by_member_id: 'jolyn' },
];
const upcoming = [{ id: 'u', name: 'Watson vaccination', est_amount_cents: 18000, next_due: '2026-10-08', active: true }];
const settings = { opening_balance_cents: 300000, reserve_target_cents: 200000 };
const fixture = { txns, members, pets, categories, upcoming, settings, today: '2026-10-03' };

const lines = s => summaryText(s).split('\n');

test('summary is fenced and every line ≤ 30 chars', () => {
  const ls = lines(buildSummary(fixture));
  assertEqual(ls[0], '```');
  assertEqual(ls.at(-1), '```');
  for (const l of ls) assert([...l].length <= 30, `too long: "${l}"`);
});

test('summary title and figures', () => {
  const txt = summaryText(buildSummary(fixture));
  assert(txt.includes('PET FUND – OCT 2026'), 'title');
  assert(txt.includes('Desmond    —  not yet'), 'not-yet row');
  assert(/Kelvin\s+RM 200\.00/.test(txt), 'Kelvin row');
  assert(/Vet\s+RM 520\.00/.test(txt), 'Vet row');
  assert(/Jolyn\s+RM 120\.00/.test(txt), 'claim row');
  assert(txt.includes('Watson vaccina'), 'due row');
});

test('empty claims and due sections are omitted', () => {
  const txt = summaryText(buildSummary({ ...fixture, txns: txns.slice(0, 4), upcoming: [] }));
  assert(!txt.includes('CLAIMS'), 'claims omitted');
  assert(!txt.includes('DUE'), 'due omitted');
});

test('long names and big amounts stay ≤ 30 chars', () => {
  const big = buildSummary({
    ...fixture,
    categories: [{ id: 'vet', name: 'Prescription Diet Food', active: true }],
    members: [...members, { id: 'm6', name: 'Grandmother Lim', email: null, active: true }],
    txns: [...txns, { ...base, id: 'f', type: 'expense', date: '2026-10-03', amount_cents: 1234567, category_id: 'vet' }],
  });
  for (const l of lines(big)) assert([...l].length <= 30, `too long: "${l}"`);
  assert(summaryText(big).includes('Prescript…'), 'truncated name');
});

test('emoji in a name keeps the amount column aligned', () => {
  const s = buildSummary({ ...fixture, categories: [{ id: 'vet', name: 'Vet 🐶', active: true }, categories[1]] });
  const vetLine = summaryText(s).split('\n').find(l => l.startsWith('Vet 🐶'));
  const kelvinLine = summaryText(s).split('\n').find(l => l.startsWith('Kelvin'));
  assertEqual([...vetLine].length, [...kelvinLine].length, 'same visible width');
});

test('amounts of RM 1 billion+ still fit in 30 chars', () => {
  const s = buildSummary({ ...fixture, settings: { opening_balance_cents: -123456789012, reserve_target_cents: 0 } });
  for (const l of summaryText(s).split('\n')) assert([...l].length <= 30, `too long: "${l}"`);
});
