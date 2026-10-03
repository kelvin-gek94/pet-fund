import { test, assertEqual } from './harness.js';
import { toCents, fromCents, sumCents, formatRM, parseAmount, parseBalance } from '../js/money.js';

test('toCents handles strings and float noise', () => {
  assertEqual(toCents('12.30'), 1230);
  assertEqual(toCents(0.1 + 0.2), 30);
  assertEqual(toCents('12.305'), 1231);
  assertEqual(toCents(-5.5), -550);
});

test('fromCents', () => assertEqual(fromCents(1230), 12.3));

test('sumCents exact', () => assertEqual(sumCents([10, 20]), 30));

test('formatRM', () => {
  assertEqual(formatRM(123450), 'RM 1,234.50');
  assertEqual(formatRM(0), 'RM 0.00');
  assertEqual(formatRM(-1200), '-RM 12.00');
});

test('parseAmount accepts positive RM with ≤ 2 decimals', () => {
  assertEqual(parseAmount('12.3'), 1230);
  assertEqual(parseAmount(' 1,200.50 '), 120050);
  assertEqual(parseAmount('RM 45'), 4500);
  assertEqual(parseAmount('0'), null);
  assertEqual(parseAmount('12.345'), null);
  assertEqual(parseAmount('-5'), null);
  assertEqual(parseAmount('abc'), null);
  assertEqual(parseAmount(''), null);
});

test('parseBalance allows zero, blank and negatives', () => {
  assertEqual(parseBalance(''), 0);
  assertEqual(parseBalance('0.00'), 0);
  assertEqual(parseBalance('-492.65'), -49265);
  assertEqual(parseBalance('- RM 1,000'), -100000);
  assertEqual(parseBalance('250'), 25000);
  assertEqual(parseBalance('12.345'), null);
  assertEqual(parseBalance('abc'), null);
});
