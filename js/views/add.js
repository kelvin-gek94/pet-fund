// Add / edit a contribution or expense. Also the landing spot for Upcoming → Mark paid.
import { state, refresh, navigate, toast } from '../app.js';
import * as db from '../db.js';
import { parseAmount, fromCents } from '../money.js';
import { todayMY } from '../dates.js';
import { nextDueAfterPaid } from '../calc.js';
import { resizeImage } from '../image.js';
import { esc, options, choices } from '../ui.js';

export function render(el, params) {
  const existing = params.id ? state.txns.find(t => t.id === params.id) : null;
  const prefill = existing ? null : state.prefill;
  state.prefill = null;
  const t = existing ?? {
    type: 'contribution', date: todayMY(), member_id: state.me.id, pet_id: null, category_id: null,
    paid_to: '', note: '', paid_by_member_id: null, receipt_path: null, ...prefill,
  };
  // Fixed for the life of this form, so a retry after a failed save updates the same row.
  const txnId = existing?.id ?? crypto.randomUUID();
  let type = t.type;
  let receiptBlob = null;        // new photo picked in this session
  let uploadedPath = null;       // receiptBlob already uploaded (by an earlier attempt)
  let receiptRemoved = false;    // existing photo removed

  el.innerHTML = `
    <h2>${existing ? 'Edit entry' : 'Add entry'}</h2>
    <div class="segmented" role="tablist">
      <button type="button" data-type="contribution">Contribution</button>
      <button type="button" data-type="expense">Expense</button>
    </div>
    <form novalidate>
      <div class="field">
        <label for="f-amount">Amount (RM)</label>
        <input id="f-amount" inputmode="decimal" autocomplete="off" placeholder="0.00"
          value="${t.amount_cents ? fromCents(t.amount_cents).toFixed(2) : ''}">
        <div class="error" data-err="amount"></div>
      </div>
      <div class="field">
        <label for="f-date">Date</label>
        <input id="f-date" type="date" value="${esc(t.date)}" max="${todayMY()}">
      </div>
      <div class="field" data-for="contribution">
        <label for="f-member">From</label>
        <select id="f-member">${options(choices(state.members, t.member_id), t.member_id ?? state.me.id)}</select>
      </div>
      <div data-for="expense">
        <div class="field">
          <label for="f-category">Category</label>
          <select id="f-category">${options(choices(state.categories, t.category_id), t.category_id, 'Choose…')}</select>
          <div class="error" data-err="category"></div>
        </div>
        <div class="field">
          <label for="f-pet">Pet</label>
          <select id="f-pet">${options(choices(state.pets, t.pet_id), t.pet_id, 'All pets')}</select>
        </div>
        <div class="field">
          <label for="f-paidto">Paid to (shop / vet)</label>
          <input id="f-paidto" autocomplete="off" value="${esc(t.paid_to)}">
        </div>
        <div class="field">
          <label for="f-paidby">Paid by</label>
          <select id="f-paidby">${options(choices(state.members, t.paid_by_member_id), t.paid_by_member_id,'Fund (Kelvin\'s account)')}</select>
          <p class="muted small" data-claim-hint hidden>This becomes a claim until Kelvin reimburses it.</p>
        </div>
        <div class="field">
          <label for="f-receipt">Receipt photo</label>
          <input id="f-receipt" type="file" accept="image/*">
          <div data-receipt></div>
          <div class="error" data-err="receipt"></div>
        </div>
      </div>
      <div class="field">
        <label for="f-note">Note</label>
        <input id="f-note" autocomplete="off" value="${esc(t.note)}">
      </div>
      <div class="error" data-err="save"></div>
      <button class="btn btn-primary btn-block" type="submit">Save</button>
    </form>`;

  const $ = s => el.querySelector(s);
  const err = (k, msg = '') => { el.querySelector(`[data-err="${k}"]`).textContent = msg; };

  function setType(next) {
    type = next;
    el.querySelectorAll('.segmented button').forEach(b => b.classList.toggle('on', b.dataset.type === type));
    el.querySelectorAll('[data-for]').forEach(s => { s.hidden = s.dataset.for !== type; });
  }
  el.querySelectorAll('.segmented button').forEach(b => b.addEventListener('click', () => setType(b.dataset.type)));
  setType(type);

  const claimHint = () => { $('[data-claim-hint]').hidden = !$('#f-paidby').value; };
  $('#f-paidby').addEventListener('change', claimHint);
  claimHint();

  async function showReceipt() {
    const box = $('[data-receipt]');
    if (receiptBlob) {
      box.innerHTML = `<img class="receipt-preview" alt="Receipt preview"><button type="button" class="link-btn small">Remove photo</button>`;
      box.querySelector('img').src = URL.createObjectURL(receiptBlob);
    } else if (t.receipt_path && !receiptRemoved) {
      box.innerHTML = `<p class="small"><a target="_blank" rel="noopener">View current receipt</a> · <button type="button" class="link-btn small">Remove</button></p>`;
      db.receiptUrl(t.receipt_path).then(url => { box.querySelector('a').href = url; }).catch(() => {});
    } else {
      box.innerHTML = '';
      return;
    }
    box.querySelector('button').addEventListener('click', () => {
      if (receiptBlob) { receiptBlob = null; uploadedPath = null; } else receiptRemoved = true;
      $('#f-receipt').value = '';
      showReceipt();
    });
  }
  showReceipt();

  $('#f-receipt').addEventListener('change', async e => {
    err('receipt');
    const file = e.target.files[0];
    if (!file) return;
    try {
      receiptBlob = await resizeImage(file);
      uploadedPath = null;
      showReceipt();
    } catch (ex) {
      err('receipt', ex.message);
      e.target.value = '';
    }
  });

  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    ['amount', 'category', 'save'].forEach(k => err(k));
    const amount_cents = parseAmount($('#f-amount').value);
    let ok = true;
    if (amount_cents == null) { err('amount', 'Enter an amount above 0, up to 2 decimals.'); ok = false; }
    if (type === 'expense' && !$('#f-category').value) { err('category', 'Choose a category.'); ok = false; }
    if (!ok) return;

    const isExpense = type === 'expense';
    const paidBy = isExpense ? ($('#f-paidby').value || null) : null;
    const txn = {
      id: txnId,
      type,
      date: $('#f-date').value || todayMY(),
      amount_cents,
      member_id: isExpense ? null : $('#f-member').value,
      category_id: isExpense ? $('#f-category').value : null,
      pet_id: isExpense ? ($('#f-pet').value || null) : null,
      paid_to: isExpense ? ($('#f-paidto').value.trim() || null) : null,
      paid_by_member_id: paidBy,
      // Keep a reimbursement only while the same sibling is still the payer.
      reimbursed_on: paidBy && paidBy === existing?.paid_by_member_id ? existing.reimbursed_on : null,
      note: $('#f-note').value.trim() || null,
      receipt_path: isExpense && !receiptRemoved ? (t.receipt_path ?? null) : null,
      deleted_at: existing?.deleted_at ?? null,
    };

    const btn = $('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      if (isExpense && receiptBlob) {
        uploadedPath ??= await db.uploadReceipt(receiptBlob, txn.id);
        txn.receipt_path = uploadedPath;
      }
      await db.saveTxn(txn);
      if (prefill?.upcomingId) {
        const item = state.upcoming.find(u => u.id === prefill.upcomingId);
        if (item) await db.saveUpcoming({ ...item, next_due: nextDueAfterPaid(item) });
      }
      await refresh();
      toast(existing ? 'Saved changes' : 'Saved');
      navigate(existing ? 'history' : 'home');
    } catch (ex) {
      err('save', `Couldn't save: ${ex.message}`);
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });
}
