import { test, assertEqual, assertDeep } from './harness.js';
import { todayMY, monthKey, addMonthsClamped, addDays, previousMonths } from '../js/dates.js';

test('todayMY is UTC+8', () => {
  assertEqual(todayMY(new Date('2026-10-02T23:30:00Z')), '2026-10-03');
  assertEqual(todayMY(new Date('2026-10-03T15:59:00Z')), '2026-10-03');
});

test('monthKey', () => assertEqual(monthKey('2026-10-03'), '2026-10'));

test('addMonthsClamped clamps month end', () => {
  assertEqual(addMonthsClamped('2026-01-31', 1), '2026-02-28');
  assertEqual(addMonthsClamped('2028-01-31', 1), '2028-02-29');
  assertEqual(addMonthsClamped('2026-11-15', 12), '2027-11-15');
});

test('previousMonths', () => {
  assertDeep(previousMonths('2026-10-03', 3), ['2026-07', '2026-08', '2026-09']);
  assertDeep(previousMonths('2026-01-15', 2), ['2025-11', '2025-12']);
});

test('addDays crosses month', () => assertEqual(addDays('2026-09-28', 7), '2026-10-05'));
