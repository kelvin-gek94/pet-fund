// Headline sentences: the screens answer their question in words first.
import { formatRM } from './money.js';

const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function coveredSentence({ months, belowReserve }) {
  if (belowReserve) return 'The fund is below the reserve.';
  if (months == null) return 'No spending yet, so nothing to measure.';
  if (months < 1) return 'The pets are covered for less than a month.';
  const n = Math.floor(months);
  return `The pets are covered for about ${n} month${n === 1 ? '' : 's'}.`;
}

export function monthCostSentence(month, cents) {
  const name = FULL_MONTHS[Number(month.slice(5, 7)) - 1];
  return cents > 0 ? `${name} cost ${formatRM(cents)}.` : `Nothing spent in ${name} yet.`;
}

export const fullMonthName = month => FULL_MONTHS[Number(month.slice(5, 7)) - 1];
