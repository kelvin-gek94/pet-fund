// History: every entry newest first, filters, edit / receipt / delete / restore.
import { state, refresh, navigate, toast, nameOf } from '../app.js';
import * as db from '../db.js';
import { formatRM, sumCents } from '../money.js';
import { todayMY, monthKey } from '../dates.js';
import { esc, options, openSheet, shortDate, monthLabel } from '../ui.js';
import { fundMonth } from '../calc.js';
import { canEditTxn } from '../roles.js';

const filters = { month: null, type: '', pet: '', category: '', person: '', deleted: false };

function label(t) {
  if (t.type === 'contribution') {
    const forOther = fundMonth(t) !== monthKey(t.date) ? ` · for ${monthLabel(fundMonth(t))}` : '';
    return `${nameOf('members', t.member_id)} · contribution${forOther}`;
  }
  const pet = t.pet_id ? nameOf('pets', t.pet_id) : 'All pets';
  return [nameOf('categories', t.category_id), pet, t.paid_to].filter(Boolean).join(' · ');
}

function matches(t) {
  if (filters.deleted !== !!t.deleted_at) return false;
  if (filters.month && monthKey(t.date) !== filters.month) return false;
  if (filters.type && t.type !== filters.type) return false;
  if (filters.pet && (filters.pet === 'all' ? t.pet_id != null || t.type !== 'expense' : t.pet_id !== filters.pet)) return false;
  if (filters.category && t.category_id !== filters.category) return false;
  if (filters.person && t.member_id !== filters.person && t.paid_by_member_id !== filters.person) return false;
  return true;
}

export function render(el) {
  filters.month ??= monthKey(todayMY());
  const months = [...new Set([monthKey(todayMY()), ...state.txns.map(t => monthKey(t.date))])].sort().reverse();

  el.innerHTML = `
    <h2>History</h2>
    <div class="card">
      <div class="figures">
        <div class="field"><label for="h-month">Month</label>
          <select id="h-month"><option value="">All months</option>
            ${months.map(m => `<option value="${m}"${m === filters.month ? ' selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="field"><label for="h-type">Type</label>
          <select id="h-type">
            <option value="">All</option>
            <option value="contribution"${filters.type === 'contribution' ? ' selected' : ''}>Contributions</option>
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
    </div>
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
      box.innerHTML = `<div class="card muted">No entries match.</div>`;
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
      return `<div class="card">
        <div class="row"><h3>${m}</h3><span class="small num"><span class="in">+${formatRM(inC)}</span> · <span class="out">−${formatRM(outC)}</span></span></div>
        <ul class="list">${list.map(t => `
          <li data-id="${t.id}" style="cursor:pointer">
            <div class="row">
              <span>${esc(label(t))}</span>
              <strong class="num ${t.type === 'contribution' ? 'in' : 'out'}">${t.type === 'contribution' ? '+' : '−'}${formatRM(t.amount_cents)}</strong>
            </div>
            <div class="row small muted">
              <span>${shortDate(t.date)}${t.receipt_path ? ' · 🧾' : ''}${t.note ? ` · ${esc(t.note)}` : ''}</span>
              <span>${t.paid_by_member_id
                ? `<span class="tag ${t.reimbursed_on ? '' : 'pending'}">${esc(nameOf('members', t.paid_by_member_id))} – ${t.reimbursed_on ? 'reimbursed' : 'to reimburse'}</span>`
                : ''}</span>
            </div>
            <div class="small muted">added by ${esc(nameOf('members', t.created_by, '?'))}${t.updated_by && t.updated_by !== t.created_by ? ` · edited by ${esc(nameOf('members', t.updated_by))}` : ''}</div>
          </li>`).join('')}</ul>
      </div>`;
    }).join('');
    box.querySelectorAll('li[data-id]').forEach(li => li.addEventListener('click', () => openActions(li.dataset.id)));
  }

  function openActions(id) {
    const t = state.txns.find(x => x.id === id);
    const mine = canEditTxn(t, state.me);
    const sheet = openSheet(`
      <h3>${esc(label(t))}</h3>
      <p class="muted small">${shortDate(t.date)} · ${formatRM(t.amount_cents)}</p>
      <div class="stack">
        ${t.deleted_at || !mine ? '' : '<button class="btn btn-block" data-a="edit">✏️ Edit</button>'}
        ${t.receipt_path ? '<button class="btn btn-block" data-a="receipt">🧾 View receipt</button>' : ''}
        ${!mine ? `<p class="muted small">${t.reimbursed_on ? 'Reimbursed claims can only be changed by the admin.'
          : 'You can only change entries you added. Ask the admin to fix this one.'}</p>`
          : t.deleted_at
          ? '<button class="btn btn-block" data-a="restore">↩️ Restore</button>'
          : '<button class="btn btn-block btn-danger" data-a="delete">🗑️ Delete</button>'}
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
