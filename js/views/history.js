// History: every entry newest first, filters, edit / receipt / delete / restore.
import { state, refresh, navigate, toast, nameOf } from '../app.js';
import * as db from '../db.js';
import { formatRM, sumCents } from '../money.js';
import { todayMY, monthKey } from '../dates.js';
import { esc, options, openSheet, monthLabel } from '../ui.js';
import { coatStack } from '../pets.js';
import { fullMonthName } from '../words.js';
import { icon } from '../icons.js';
import { fundMonth } from '../calc.js';
import { canEditTxn } from '../roles.js';
import { txnLines } from '../lines.js';

const filters = { month: null, type: '', pet: '', category: '', person: '', deleted: false };

const dayMonth = d => `${Number(d.slice(8, 10))} ${monthLabel(d.slice(0, 7)).slice(0, 3)}`;
const andList = xs => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

// One entry in plain words: a title, a detail line, and (for claims) who is owed.
function describe(t) {
  if (t.type === 'contribution') {
    const forOther = fundMonth(t) !== monthKey(t.date);
    return {
      title: `${nameOf('members', t.member_id)} chipped in`,
      sub: forOther ? `for ${fullMonthName(fundMonth(t))}, paid ${dayMonth(t.date)}` : dayMonth(t.date),
    };
  }
  const ls = txnLines(t);
  const cats = [...new Set(ls.map(l => nameOf('categories', l.category_id)))];
  const claim = t.paid_by_member_id
    ? (t.reimbursed_on ? `Paid back to ${nameOf('members', t.paid_by_member_id)}` : `${nameOf('members', t.paid_by_member_id)} to be paid back`)
    : '';
  return {
    title: andList(cats.map((c, i) => (i ? c.toLowerCase() : c))),
    sub: [t.paid_to, dayMonth(t.date)].filter(Boolean).join(', '),
    claim,
    pending: !!t.paid_by_member_id && !t.reimbursed_on,
  };
}
const label = t => describe(t).title;

function leadMark(t) {
  if (t.type === 'contribution') return `<span class="monogram">${esc(nameOf('members', t.member_id).slice(0, 1))}</span>`;
  const ids = [...new Set(txnLines(t).flatMap(l => l.pet_ids))];
  return coatStack(ids, state.pets, 22);
}

function matches(t) {
  if (filters.deleted !== !!t.deleted_at) return false;
  if (filters.month && monthKey(t.date) !== filters.month) return false;
  if (filters.type && t.type !== filters.type) return false;
  const ls = txnLines(t);
  if (filters.pet && !ls.some(l => (filters.pet === 'all' ? !l.pet_ids.length : l.pet_ids.includes(filters.pet)))) return false;
  if (filters.category && !ls.some(l => l.category_id === filters.category)) return false;
  if (filters.person && t.member_id !== filters.person && t.paid_by_member_id !== filters.person) return false;
  return true;
}

export function render(el) {
  filters.month ??= '';
  const months = [...new Set([monthKey(todayMY()), ...state.txns.map(t => monthKey(t.date))])].sort().reverse();

  el.innerHTML = `
    <h2>History</h2>
    <details class="filters"${filters.month || filters.type || filters.pet || filters.category || filters.person || filters.deleted ? ' open' : ''}>
      <summary class="link-btn" style="list-style:none;margin-bottom:12px">Filter entries</summary>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">
        <div class="field"><label for="h-month">Month</label>
          <select id="h-month"><option value="">All months</option>
            ${months.map(m => `<option value="${m}"${m === filters.month ? ' selected' : ''}>${monthLabel(m)}</option>`).join('')}</select></div>
        <div class="field"><label for="h-type">Type</label>
          <select id="h-type">
            <option value="">All</option>
            <option value="contribution"${filters.type === 'contribution' ? ' selected' : ''}>Chip-ins</option>
            <option value="expense"${filters.type === 'expense' ? ' selected' : ''}>Expenses</option>
          </select></div>
        <div class="field"><label for="h-pet">Pet</label>
          <select id="h-pet"><option value="">Any</option>
            <option value="all"${filters.pet === 'all' ? ' selected' : ''}>All pets (shared)</option>
            ${options(state.pets, filters.pet)}</select></div>
        <div class="field"><label for="h-cat">Category</label>
          <select id="h-cat">${options(state.categories, filters.category, 'Any')}</select></div>
        <div class="field"><label for="h-person">Person</label>
          <select id="h-person">${options(state.members, filters.person, 'Anyone')}</select></div>
        <div class="field"><label for="h-del">Show</label>
          <select id="h-del"><option value="">Current</option>
            <option value="1"${filters.deleted ? ' selected' : ''}>Deleted</option></select></div>
      </div>
    </details>
    <div id="h-list"></div>`;

  const bind = (id, key, map = v => v) => el.querySelector(id).addEventListener('change', e => {
    filters[key] = map(e.target.value);
    drawList();
  });
  bind('#h-month', 'month', v => v || '');
  bind('#h-type', 'type');
  bind('#h-pet', 'pet');
  bind('#h-cat', 'category');
  bind('#h-person', 'person');
  bind('#h-del', 'deleted', v => v === '1');

  function drawList() {
    const rows = state.txns.filter(matches);
    const box = el.querySelector('#h-list');
    if (!rows.length) {
      box.innerHTML = `<p class="muted">Nothing here yet. Tap ＋ to add a chip-in or an expense.</p>`;
      return;
    }
    const groups = new Map();
    for (const t of rows) {
      const m = monthKey(t.date);
      if (!groups.has(m)) groups.set(m, []);
      groups.get(m).push(t);
    }
    box.innerHTML = [...groups].map(([m, list]) => {
      const inC = sumCents(list.filter(t => t.type === 'contribution').map(t => t.amount_cents));
      const outC = sumCents(list.filter(t => t.type === 'expense').map(t => t.amount_cents));
      const thisYear = m.slice(0, 4) === todayMY().slice(0, 4);
      return `<section style="margin-bottom:18px">
        <h3 style="margin:6px 0 0">${fullMonthName(m)}${thisYear ? '' : ` ${m.slice(0, 4)}`}</h3>
        <p class="muted small num" style="margin:0 0 4px">In ${formatRM(inC)}, out ${formatRM(outC)}</p>
        <ul class="rows">${list.map(t => {
          const d = describe(t);
          const by = nameOf('members', t.created_by, '?');
          return `<li data-id="${t.id}" style="cursor:pointer">
            ${leadMark(t)}
            <span class="grow">${esc(d.title)}
              <span class="sub">${esc(d.sub)}${t.receipt_path ? ' ' + icon('receipt', 14) : ''}</span>
              ${d.claim ? `<span class="sub ${d.pending ? 'warn-text' : ''}">${esc(d.claim)}</span>` : ''}
              ${t.note ? `<span class="sub">${esc(t.note)}</span>` : ''}
              <span class="sub" style="color:var(--faint)">Added by ${esc(by)}${t.updated_by && t.updated_by !== t.created_by ? `, edited by ${esc(nameOf('members', t.updated_by))}` : ''}</span>
            </span>
            <span class="end num ${t.type === 'contribution' ? 'in' : 'out'}">${t.type === 'contribution' ? '+' : '−'}${formatRM(t.amount_cents).replace('RM ', '')}</span>
          </li>`;
        }).join('')}</ul>
      </section>`;
    }).join('');
    box.querySelectorAll('li[data-id]').forEach(li => li.addEventListener('click', () => openActions(li.dataset.id)));
  }

  function openActions(id) {
    const t = state.txns.find(x => x.id === id);
    const mine = canEditTxn(t, state.me);
    const sheet = openSheet(`
      <h3>${esc(label(t))}</h3>
      <p class="muted small">${dayMonth(t.date)}, ${formatRM(t.amount_cents)}</p>
      <div class="stack">
        ${t.deleted_at || !mine ? '' : `<button class="btn btn-block" data-a="edit">${icon('pencil', 18)}Edit</button>`}
        ${t.receipt_path ? `<button class="btn btn-block" data-a="receipt">${icon('eye', 18)}View receipt</button>` : ''}
        ${!mine ? `<p class="muted small">${t.reimbursed_on ? 'Paid-back claims can only be changed by the admin.'
          : 'You can only change entries you added. Ask the admin to fix this one.'}</p>`
          : t.deleted_at
          ? `<button class="btn btn-block" data-a="restore">${icon('arrow-back-up', 18)}Restore</button>`
          : `<button class="btn btn-block btn-danger" data-a="delete">${icon('trash', 18)}Delete</button>`}
        <button class="btn btn-block" data-a="close">Close</button>
      </div>`);
    const on = (a, fn) => sheet.el.querySelector(`[data-a="${a}"]`)?.addEventListener('click', fn);
    on('close', sheet.close);
    on('edit', () => { sheet.close(); navigate('add', { id }); });
    on('receipt', async () => {
      const win = window.open('', '_blank');   // open synchronously so phones don't block the popup
      try {
        const url = await db.receiptUrl(t.receipt_path);
        if (win) win.location = url;
        else location.href = url;              // pop-ups blocked: open in this tab instead
      } catch (ex) {
        win?.close();
        toast(`Couldn't open receipt: ${ex.message}`);
      }
    });
    const change = (fn, msg) => async () => {
      try {
        await fn(id);
        await refresh();
        sheet.close();
        toast(msg);
        drawList();
      } catch (ex) {
        toast(`Couldn't update: ${ex.message}`);
      }
    };
    on('delete', () => { if (confirm('Delete this entry? You can restore it later from History → Show: Deleted.')) change(db.softDelete, 'Deleted')(); });
    on('restore', change(db.restore, 'Restored'));
  }

  drawList();
}
