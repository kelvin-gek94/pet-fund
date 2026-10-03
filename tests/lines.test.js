import { test, assertEqual, assertDeep } from './harness.js';
import { splitEvenly, txnLines, linesFromDb, linesToDb, linesError } from '../js/lines.js';

test('splitEvenly shares cents exactly, remainder to the first', () => {
  assertDeep(splitEvenly(9000, 3), [3000, 3000, 3000]);
  assertDeep(splitEvenly(1000, 3), [334, 333, 333]);
  assertDeep(splitEvenly(5, 1), [5]);
});

test('txnLines: uses lines, or builds one line from an older single-category expense', () => {
  const withLines = { type: 'expense', amount_cents: 500, lines: [{ category_id: 'food', pet_ids: ['a'], amount_cents: 500 }] };
  assertDeep(txnLines(withLines), withLines.lines);
  assertDeep(txnLines({ type: 'expense', amount_cents: 700, category_id: 'vet', pet_id: 'mochi' }),
    [{ category_id: 'vet', pet_ids: ['mochi'], amount_cents: 700 }]);
  assertDeep(txnLines({ type: 'expense', amount_cents: 700, category_id: 'vet', pet_id: null }),
    [{ category_id: 'vet', pet_ids: [], amount_cents: 700 }]);
  assertDeep(txnLines({ type: 'contribution', amount_cents: 100 }), []);
});

test('linesFromDb / linesToDb convert RM <-> cents', () => {
  assertDeep(linesFromDb([{ category_id: 'food', pet_ids: ['a', 'b'], amount: '80.10' }]),
    [{ category_id: 'food', pet_ids: ['a', 'b'], amount_cents: 8010 }]);
  assertDeep(linesToDb([{ category_id: 'food', pet_ids: [], amount_cents: 2550 }]),
    [{ category_id: 'food', pet_ids: [], amount: 25.5 }]);
});

test('linesError: every line needs a category and an amount above 0', () => {
  assertEqual(linesError([{ category_id: 'food', pet_ids: [], amount_cents: 100 }]), '');
  assertEqual(linesError([]), 'Add at least one line.');
  assertEqual(linesError([{ category_id: null, pet_ids: [], amount_cents: 100 }]), 'Line 1: choose a category.');
  assertEqual(linesError([{ category_id: 'a', pet_ids: [], amount_cents: 100 }, { category_id: 'b', pet_ids: [], amount_cents: null }]),
    'Line 2: enter an amount above 0, up to 2 decimals.');
});
