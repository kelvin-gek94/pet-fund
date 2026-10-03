// Money is handled as integer cents (sen) everywhere; convert only at the edges.

export function toCents(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  // The epsilon absorbs binary float noise such as 12.305 * 100 = 1230.4999…
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-7);
}

export function fromCents(c) {
  return c / 100;
}

export function sumCents(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

export function formatRM(c) {
  const abs = (Math.abs(c) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${c < 0 ? '-' : ''}RM ${abs}`;
}

// User-typed amount → cents, or null when it isn't a positive RM value with ≤ 2 decimals.
export function parseAmount(text) {
  const s = String(text ?? '').replace(/rm/i, '').replace(/[,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const c = toCents(s);
  return c > 0 ? c : null;
}

// Like parseAmount, but blank/zero → 0 and a leading "-" is allowed (opening balance, reserve).
export function parseBalance(text) {
  const s = String(text ?? '').trim();
  const neg = s.startsWith('-');
  const rest = neg ? s.slice(1) : s;
  if (/^\s*(rm)?\s*[0.,\s]*$/i.test(rest)) return 0;
  const c = parseAmount(rest);
  return c == null ? null : neg ? -c : c;
}
