// Receipt lines: an expense is one receipt split into lines of { category_id, pet_ids, amount_cents }.
// pet_ids = [] means "All pets". The expense total is the sum of its lines.
import { toCents, fromCents } from './money.js';

// Split cents evenly; leftover sen go to the first parts so the total is exact.
export function splitEvenly(cents, n) {
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => base + (i < cents - base * n ? 1 : 0));
}

// Lines of an expense; expenses saved before lines existed become a single line.
export function txnLines(t) {
  if (t.type !== 'expense') return [];
  if (t.lines?.length) return t.lines;
  return [{ category_id: t.category_id ?? null, pet_ids: t.pet_id ? [t.pet_id] : [], amount_cents: t.amount_cents }];
}

export const linesFromDb = lines => (lines ?? []).map(l => ({
  category_id: l.category_id ?? null,
  pet_ids: l.pet_ids ?? [],
  amount_cents: toCents(l.amount),
}));

export const linesToDb = lines => lines.map(l => ({
  category_id: l.category_id,
  pet_ids: l.pet_ids,
  amount: fromCents(l.amount_cents),
}));

export function linesError(lines) {
  if (!lines.length) return 'Add at least one line.';
  for (const [i, l] of lines.entries()) {
    if (!l.category_id) return `Line ${i + 1}: choose a category.`;
    if (!(l.amount_cents > 0)) return `Line ${i + 1}: enter an amount above 0, up to 2 decimals.`;
  }
  return '';
}
