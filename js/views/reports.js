// Reports for a month or a year: spend by category, by pet, contributions, in vs out.
import { state, nameOf } from '../app.js';
import { formatRM, sumCents } from '../money.js';
import { todayMY, monthKey } from '../dates.js';
import { spendBy, inOutByMonth } from '../calc.js';
import { esc } from '../ui.js';

const view = { mode: 'month', month: null, year: null };

function bars(rows, cls = '') {
  if (!rows.length) return '<p class="muted small">No entries yet</p>';
  const max = Math.max(...rows.map(r => r.cents), 1);
  return rows.map(r => `
    <div class="bar-row">
      <span>${esc(r.label)}</span>
      <div class="bar ${cls}" style="width:${(r.cents / max) * 100}%"></div>
      <span class="num small">${formatRM(r.cents)}</span>
    </div>`).join('');
}

const lastDay = m => {
  const [y, mm] = m.split('-').map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, '0')}`;
};

export function render(el) {
  const today = todayMY();
  view.month ??= monthKey(today);
  view.year ??= today.slice(0, 4);
  const live = state.txns.filter(t => !t.deleted_at);
  const months = [...new Set([monthKey(today), ...live.map(t => monthKey(t.date))])].sort().reverse();
  const years = [...new Set(months.map(m => m.slice(0, 4)))];

  const [from, to] = view.mode === 'month'
    ? [`${view.month}-01`, lastDay(view.month)]
    : [`${view.year}-01-01`, `${view.year}-12-31`];
  const inRange = live.filter(t => t.date >= from && t.date <= to);

  const toRows = (map, list, nullLabel) => [...map]
    .map(([id, cents]) => ({ label: id == null ? nullLabel : nameOf(list, id), cents }))
    .sort((a, b) => b.cents - a.cents);
  const byCategory = toRows(spendBy(live, 'category_id', from, to), 'categories', 'Other');
  const byPet = toRows(spendBy(live, 'pet_id', from, to), 'pets', 'All pets');
  const byMember = state.members
    .map(m => ({ label: m.name, cents: sumCents(inRange.filter(t => t.type === 'contribution' && t.member_id === m.id).map(t => t.amount_cents)) }))
    .filter(r => r.cents > 0);
  const totalIn = sumCents(byMember.map(r => r.cents));
  const totalOut = sumCents(byCategory.map(r => r.cents));

  // Start the trend at the first month with entries, so months before the app existed aren't listed.
  const firstMonth = months.at(-1);
  const trendFrom = firstMonth > `${view.year}-01` ? firstMonth : `${view.year}-01`;
  const trend = inOutByMonth(live, trendFrom, view.year === today.slice(0, 4) ? monthKey(today) : `${view.year}-12`);
  const trendMax = Math.max(...trend.map(r => Math.max(r.in_cents, r.out_cents)), 1);

  el.innerHTML = `
    <h2>Reports</h2>
    <div class="segmented">
      <button type="button" data-mode="month" class="${view.mode === 'month' ? 'on' : ''}">Month</button>
      <button type="button" data-mode="year" class="${view.mode === 'year' ? 'on' : ''}">Year</button>
    </div>
    <div class="field">
      ${view.mode === 'month'
        ? `<select id="r-period">${months.map(m => `<option${m === view.month ? ' selected' : ''}>${m}</option>`).join('')}</select>`
        : `<select id="r-period">${years.map(y => `<option${y === view.year ? ' selected' : ''}>${y}</option>`).join('')}</select>`}
    </div>
    <div class="card figures">
      <div><div class="muted small">Money in</div><div class="figure num in">${formatRM(totalIn)}</div></div>
      <div><div class="muted small">Spent</div><div class="figure num out">${formatRM(totalOut)}</div></div>
    </div>
    <div class="card"><h3>Spending by category</h3>${bars(byCategory)}</div>
    <div class="card"><h3>Spending by pet</h3>${bars(byPet)}</div>
    <div class="card"><h3>Contributions</h3>${bars(byMember, 'in')}</div>
    ${view.mode === 'year' ? `
      <div class="card"><h3>In vs out by month</h3>
        ${trend.map(r => `
          <div class="small" style="margin:8px 0">
            <div class="row"><span>${r.month}</span><span class="num"><span class="in">+${formatRM(r.in_cents)}</span> · <span class="out">−${formatRM(r.out_cents)}</span></span></div>
            <div class="bar in" style="width:${(r.in_cents / trendMax) * 100}%;margin-top:3px"></div>
            <div class="bar out" style="width:${(r.out_cents / trendMax) * 100}%;margin-top:3px"></div>
          </div>`).join('')}
      </div>` : ''}`;

  el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { view.mode = b.dataset.mode; render(el); }));
  el.querySelector('#r-period').addEventListener('change', e => {
    if (view.mode === 'month') view.month = e.target.value; else view.year = e.target.value;
    render(el);
  });
}
