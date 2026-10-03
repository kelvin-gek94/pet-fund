// Reports for a month or a year: what it cost, needs vs wants, per pet, per category, chip-ins, in and out.
import { state, nameOf } from '../app.js';
import { formatRM, sumCents } from '../money.js';
import { todayMY, monthKey } from '../dates.js';
import { spendBy, inOutByMonth, fundMonth, needsWants } from '../calc.js';
import { esc, monthLabel } from '../ui.js';
import { coatSvg, coatOf, petColor } from '../pets.js';
import { monthCostSentence } from '../words.js';

const view = { mode: 'month', month: null, year: null };

const lastDay = m => {
  const [y, mm] = m.split('-').map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, '0')}`;
};

export function render(el) {
  const today = todayMY();
  view.month ??= monthKey(today);
  view.year ??= today.slice(0, 4);
  const live = state.txns.filter(t => !t.deleted_at);
  const months = [...new Set([monthKey(today), ...live.map(t => monthKey(t.date)),
    ...live.filter(t => t.type === 'contribution').map(fundMonth)])].sort().reverse();
  const years = [...new Set(months.map(m => m.slice(0, 4)))];

  const [from, to] = view.mode === 'month'
    ? [`${view.month}-01`, lastDay(view.month)]
    : [`${view.year}-01-01`, `${view.year}-12-31`];
  const inRange = live.filter(t => t.date >= from && t.date <= to);

  const toRows = (map, list, nullLabel) => [...map]
    .map(([id, cents]) => ({ label: id == null ? nullLabel : nameOf(list, id), cents }))
    .sort((a, b) => b.cents - a.cents);
  const byCategory = toRows(spendBy(live, 'category_id', from, to), 'categories', 'Other');
  const petMap = spendBy(live, 'pet_id', from, to);
  const petSpend = [...petMap].map(([id, cents]) => {
    const pet = state.pets.find(p => p.id === id) ?? null;
    return { pet, label: pet ? pet.name : 'All pets', cents, color: pet ? petColor(pet, state.pets) : 'var(--faint)' };
  }).sort((a, b) => b.cents - a.cents);
  // Contributions per sibling follow "For month"; Money in follows the transfer date (cash flow).
  const [fromMonth, toMonth] = [monthKey(from), monthKey(to)];
  const forPeriod = live.filter(t => t.type === 'contribution' && fundMonth(t) >= fromMonth && fundMonth(t) <= toMonth);
  const byMember = state.members
    .map(m => ({ label: m.name, cents: sumCents(forPeriod.filter(t => t.member_id === m.id).map(t => t.amount_cents)) }))
    .filter(r => r.cents > 0);
  const totalIn = sumCents(inRange.filter(t => t.type === 'contribution').map(t => t.amount_cents));
  const totalOut = sumCents(byCategory.map(r => r.cents));
  const nw = needsWants(live, state.categories, from, to);

  // Start the trend at the first month with entries, so months before the app existed aren't listed.
  const firstMonth = months.at(-1);
  const trendFrom = firstMonth > `${view.year}-01` ? firstMonth : `${view.year}-01`;
  const trend = inOutByMonth(live, trendFrom, view.year === today.slice(0, 4) ? monthKey(today) : `${view.year}-12`);
  const trendMax = Math.max(...trend.map(r => Math.max(r.in_cents, r.out_cents)), 1);

  const headline = view.mode === 'month' ? monthCostSentence(view.month, totalOut)
    : totalOut > 0 ? `${view.year} cost ${formatRM(totalOut)}.` : `Nothing spent in ${view.year} yet.`;
  const petMax = Math.max(...petSpend.map(r => r.cents), 1);
  const amountRows = rows => (rows.length
    ? `<ul class="rows">${rows.map(r => `<li><span class="grow">${esc(r.label)}</span><span class="end num">${formatRM(r.cents)}</span></li>`).join('')}</ul>`
    : '<p class="muted small">Nothing yet for this period.</p>');

  el.innerHTML = `
    <div class="segmented">
      <button type="button" data-mode="month" class="${view.mode === 'month' ? 'on' : ''}">Month</button>
      <button type="button" data-mode="year" class="${view.mode === 'year' ? 'on' : ''}">Year</button>
    </div>
    <select id="r-period" aria-label="Period">
      ${view.mode === 'month'
        ? months.map(m => `<option value="${m}"${m === view.month ? ' selected' : ''}>${monthLabel(m)}</option>`).join('')
        : years.map(y => `<option${y === view.year ? ' selected' : ''}>${y}</option>`).join('')}
    </select>

    <p class="headline">${esc(headline)}</p>
    ${totalOut > 0 ? `
      <p class="subline num">${formatRM(nw.need_cents)} on needs and ${formatRM(nw.want_cents)} on wants.</p>
      <div class="split" style="margin-top:12px" aria-hidden="true">
        <span style="flex:${nw.need_cents};background:var(--ink)"></span><span style="flex:${nw.want_cents};background:var(--brass)"></span>
      </div>
      <div class="row small muted"><span>Needs</span><span>Wants</span></div>` : ''}
    <p class="subline num" style="margin-top:10px">${formatRM(totalIn)} came in.</p>

    <h3>By pet</h3>
    ${petSpend.length ? `<div class="petbars">${petSpend.map(r => `
      ${r.pet ? coatSvg(coatOf(r.pet), 22) : coatSvg('plain', 22)}
      <span class="small">${esc(r.label)}</span>
      <span class="bar" style="width:${Math.max(2, (r.cents / petMax) * 100)}%;background:${r.color}"></span>
      <span class="num small">${formatRM(r.cents)}</span>`).join('')}
    </div>` : '<p class="muted small">Nothing yet for this period.</p>'}

    <h3>By category</h3>
    ${amountRows(byCategory)}

    <h3>Chip-ins for this period</h3>
    ${amountRows(byMember)}

    ${view.mode === 'year' ? `
      <h3>In and out by month</h3>
      <div class="trend">${trend.map(r => `
        <span>${monthLabel(r.month).slice(0, 3)}</span>
        <span class="bars" title="In ${formatRM(r.in_cents)}, out ${formatRM(r.out_cents)}">
          <span class="bar" style="width:${(r.in_cents / trendMax) * 100}%;background:var(--leaf)"></span>
          <span class="bar" style="width:${(r.out_cents / trendMax) * 100}%;background:var(--rust)"></span>
        </span>`).join('')}
      </div>
      <p class="muted small"><span class="in">Green</span> is money in, <span class="out">red</span> is money out.</p>` : ''}`;

  el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { view.mode = b.dataset.mode; render(el); }));
  el.querySelector('#r-period').addEventListener('change', e => {
    if (view.mode === 'month') view.month = e.target.value; else view.year = e.target.value;
    render(el);
  });
}
