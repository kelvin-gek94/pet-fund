// Monthly summary for the sibling WhatsApp group: a text table and a PNG image.
import { formatRM, sumCents } from './money.js';
import { monthKey } from './dates.js';
import {
  cashInFund, availableCents, avgMonthlySpend, runway, contributionsInMonth,
  pendingClaims, spendBy, dueSoon, needsWants,
} from './calc.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const LABEL = 10;   // label column width
const AMOUNT = 14;  // right-aligned amount column width

const trunc = (s, n) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s);
// Pad by code points (what the 30-char limit counts), so emoji don't shift the columns.
const padEnd = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].length));
const padStart = (s, n) => ' '.repeat(Math.max(0, n - [...s].length)) + s;
const WIDTH = 30;
const nameOf = (list, id, fallback) => list.find(x => x.id === id)?.name ?? fallback;

export function buildSummary({ txns, members, pets, categories, upcoming, settings, today }) {
  const month = monthKey(today);
  const [y, m] = month.split('-');
  const opening = settings.opening_balance_cents ?? 0;
  const reserve = settings.reserve_target_cents ?? 0;
  const cash = cashInFund(txns, opening);
  const available = availableCents(txns, opening);
  const rw = runway(available, reserve, avgMonthlySpend(txns, today));

  const contributions = contributionsInMonth(txns, members, month)
    .map(c => ({ name: c.name, total_cents: c.total_cents }));
  const spending = [...spendBy(txns, 'category_id', `${month}-01`, `${month}-31`)]
    .map(([id, total_cents]) => ({ name: nameOf(categories, id, 'Other'), total_cents }))
    .filter(s => s.total_cents > 0)
    .sort((a, b) => b.total_cents - a.total_cents);

  return {
    title: `PET FUND – ${MONTHS[Number(m) - 1]} ${y}`,
    cash,
    available,
    runway: rw.months,
    belowReserve: rw.belowReserve,
    reserve,
    contributions,
    contribTotal: sumCents(contributions.map(c => c.total_cents)),
    spending,
    spendTotal: sumCents(spending.map(s => s.total_cents)),
    ...needsWants(txns, categories, `${month}-01`, `${month}-31`),
    claims: pendingClaims(txns).map(c => ({ name: nameOf(members, c.member_id, '?'), total_cents: c.total_cents })),
    due: dueSoon(upcoming, today).map(u => ({ name: u.name, date: u.next_due, overdue: u.overdue })),
  };
}

function row(label, cents) {
  let amount = formatRM(cents);
  // Only reachable above RM 1 billion: drop the sen so the line stays within WIDTH.
  if ([...amount].length > WIDTH - LABEL - 1) amount = amount.replace(/\.\d\d$/, '');
  return `${padEnd(trunc(label, LABEL), LABEL)} ${padStart(amount, AMOUNT)}`;
}

function runwayText(s) {
  const value = s.runway == null ? '—' : `≈ ${s.runway} mo`;
  const flag = s.belowReserve ? ' ⚠' : s.reserve > 0 ? ' ✓' : '';
  return `${padEnd('Runway', LABEL)} ${value}${flag}`;
}

export function summaryText(s) {
  const out = ['```', `🐾 ${s.title}`, row('Cash', s.cash), row('Available', s.available), runwayText(s)];
  if (s.reserve > 0) out.push(row('Reserve', s.reserve));

  out.push('', 'CHIP-INS');
  for (const c of s.contributions) {
    out.push(c.total_cents > 0 ? row(c.name, c.total_cents) : `${padEnd(trunc(c.name, LABEL), LABEL)} —  not yet`);
  }
  out.push(row('Total', s.contribTotal));

  out.push('', 'SPENDING');
  for (const sp of s.spending) out.push(row(sp.name, sp.total_cents));
  out.push(row('Total', s.spendTotal));
  if (s.spendTotal > 0) out.push(row('Needs', s.need_cents), row('Wants', s.want_cents));

  if (s.claims.length) {
    out.push('', 'TO PAY BACK');
    for (const c of s.claims) out.push(row(c.name, c.total_cents));
  }
  if (s.due.length) {
    out.push('', 'DUE SOON');
    for (const d of s.due) {
      const [, mm, dd] = d.date.split('-');
      out.push(`${padEnd(trunc(d.name, 18), 18)} ${dd}/${mm}${d.overdue ? ' !' : ''}`);
    }
  }
  out.push('```');
  return out.join('\n');
}

// Draws the same content as a table image (1080 px wide) and returns a PNG Blob.
export async function drawSummaryImage(s) {
  const W = 1080, PAD = 56, ROW = 64, HEAD = 76;
  const sections = [
    ['Overview', [
      ['Cash in fund', formatRM(s.cash)],
      ['Available', formatRM(s.available)],
      ['Runway', s.runway == null ? '—' : `≈ ${s.runway} months${s.belowReserve ? '  ⚠ below reserve' : ''}`],
      ...(s.reserve > 0 ? [['Reserve target', formatRM(s.reserve)]] : []),
    ]],
    ['Chip-ins', [
      ...s.contributions.map(c => [c.name, c.total_cents > 0 ? formatRM(c.total_cents) : 'Not yet']),
      ['Total', formatRM(s.contribTotal)],
    ]],
    ['Spending', [...s.spending.map(x => [x.name, formatRM(x.total_cents)]), ['Total', formatRM(s.spendTotal)],
      ...(s.spendTotal > 0 ? [['Needs', formatRM(s.need_cents)], ['Wants', formatRM(s.want_cents)]] : [])]],
    ...(s.claims.length ? [['To pay back', s.claims.map(c => [c.name, formatRM(c.total_cents)])]] : []),
    ...(s.due.length ? [['Due soon', s.due.map(d => {
      const [, mm, dd] = d.date.split('-');
      return [d.name, `${dd}/${mm}${d.overdue ? ' (overdue)' : ''}`];
    })]] : []),
  ];
  const rows = sections.reduce((n, [, r]) => n + r.length, 0);
  const H = PAD * 2 + 110 + sections.length * (HEAD + 24) + rows * ROW;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#F4F6F3';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1E2B2A';
  g.font = '600 56px "Baloo 2", system-ui, sans-serif';
  g.fillText(`🐾 ${s.title}`, PAD, PAD + 52);

  let y = PAD + 110;
  for (const [heading, items] of sections) {
    g.fillStyle = '#1E2B2A';
    g.fillRect(PAD, y, W - PAD * 2, HEAD);
    g.fillStyle = '#ffffff';
    g.font = '600 36px "Baloo 2", system-ui, sans-serif';
    g.fillText(heading, PAD + 24, y + 50);
    y += HEAD;
    items.forEach(([label, value], i) => {
      const isTotal = label === 'Total';
      g.fillStyle = i % 2 ? '#E6EBE6' : '#FFFFFF';
      g.fillRect(PAD, y, W - PAD * 2, ROW);
      g.fillStyle = '#1E2B2A';
      g.font = `${isTotal ? 700 : 400} 32px system-ui, sans-serif`;
      g.textAlign = 'left';
      g.fillText(label, PAD + 24, y + 43);
      g.textAlign = 'right';
      g.fillText(value, W - PAD - 24, y + 43);
      g.textAlign = 'left';
      y += ROW;
    });
    y += 24;
  }
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
