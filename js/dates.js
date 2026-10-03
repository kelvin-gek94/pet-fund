// Dates are 'YYYY-MM-DD' strings in Malaysia time (UTC+8). All math is done on
// UTC-midnight Date objects so the device's own timezone never leaks in.

const MY_OFFSET_MS = 8 * 60 * 60 * 1000;

function parse(date) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

function fmt(dt) {
  return dt.toISOString().slice(0, 10);
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function todayMY(now = new Date()) {
  return fmt(new Date(now.getTime() + MY_OFFSET_MS));
}

export function monthKey(date) {
  return date.slice(0, 7);
}

export function addMonthsClamped(date, n) {
  const { y, m, d } = parse(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return fmt(new Date(Date.UTC(ny, nm - 1, nd)));
}

export function addDays(date, n) {
  const { y, m, d } = parse(date);
  return fmt(new Date(Date.UTC(y, m - 1, d + n)));
}

export function previousMonths(today, n) {
  const first = `${monthKey(today)}-01`;
  const out = [];
  for (let i = n; i >= 1; i--) out.push(monthKey(addMonthsClamped(first, -i)));
  return out;
}
