// Add / edit a contribution or expense. Also the landing spot for Upcoming → Mark paid.
import { state, refresh, navigate, toast } from '../app.js';
import * as db from '../db.js';
import { parseAmount, fromCents, sumCents, formatRM } from '../money.js';
import { todayMY } from '../dates.js';
import { nextDueAfterPaid, fundMonth, defaultForMonth, forMonthOptions } from '../calc.js';
import { resizeImage } from '../image.js';
import { canEditTxn } from '../roles.js';
import { txnLines, linesError } from '../lines.js';
import { petTag, petColor } from '../pets.js';
import { icon } from '../icons.js';
import { esc, options, choices, monthLabel } from '../ui.js';

export function render(el, params) {
  const existing = params.id ? state.txns.find(t => t.id === params.id) : null;
  if (existing && !canEditTxn(existing, state.me)) {
    el.innerHTML = '<div class="card"><p>You can only change entries you added.</p><p class="muted small">Ask the admin to fix this one.</p></div>';
    return;
  }
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
    <h2>${existing ? 'Edit entry' : 'New entry'}</h2>
    <div class="segmented" role="tablist">
      <button type="button" data-type="contribution">Chip-in</button>
      <button type="button" data-type="expense">Expense</button>
    </div>
    <form novalidate>
      <div class="field" data-for="contribution">
        <label for="f-amount">Amount (RM)</label>
        <input id="f-amount" inputmode="decimal" autocomplete="off" placeholder="0.00"
          value="${t.type === 'contribution' && t.amount_cents ? fromCents(t.amount_cents).toFixed(2) : ''}">
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
      <div class="field" data-for="contribution">
        <label for="f-formonth">For month</label>
        <select id="f-formonth"></select>
        <p class="muted small">Paying early or late? Pick the month this money is for.</p>
      </div>
      <div data-for="expense">
        <div data-lines></div>
        <button type="button" class="link-btn" data-add-line>＋ Add a line</button>
        <div class="total"><span class="muted">Receipt total</span><span class="display num" data-total>RM 0.00</span></div>
        <div class="error" data-err="lines"></div>
        <div class="field">
          <label for="f-paidto">Shop or vet</label>
          <input id="f-paidto" autocomplete="off" value="${esc(t.paid_to)}">
        </div>
        <div class="field">
          <label for="f-paidby">Paid by</label>
          <select id="f-paidby">${options(choices(state.members, t.paid_by_member_id), t.paid_by_member_id,'Fund (Kelvin\'s account)')}</select>
          <p class="muted small" data-claim-hint hidden>Kelvin pays them back later. It shows under To pay back.</p>
        </div>
        <div class="field">
          <label>Receipt photo</label>
          <label for="f-receipt" class="btn" style="color:var(--ink);font-size:0.95rem;margin:0">${icon('camera', 18)}Add a photo</label>
          <input id="f-receipt" type="file" accept="image/*" style="position:absolute;opacity:0;width:1px;height:1px">
          <p class="muted small" style="margin:6px 0 0">Crop out any bank account numbers first.</p>
          <div data-receipt></div>
          <div class="error" data-err="receipt"></div>
        </div>
      </div>
      <div class="field">
        <label for="f-note">Note</label>
        <input id="f-note" autocomplete="off" value="${esc(t.note)}">
      </div>
      <div class="error" data-err="save"></div>
      <button class="btn btn-primary btn-block" type="submit" data-save>Save</button>
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

  // "For month": editing keeps the stored month; a new entry suggests the sibling's next unpaid month.
  let forMonthTouched = !!existing;
  function fillForMonth() {
    const today = todayMY();
    const current = existing?.type === 'contribution' ? fundMonth(existing) : defaultForMonth(state.txns, $('#f-member').value, today);
    const months = [...new Set([...forMonthOptions(today), current])].sort();
    $('#f-formonth').innerHTML = months
      .map(m => `<option value="${m}"${m === current ? ' selected' : ''}>${monthLabel(m)}</option>`).join('');
  }
  fillForMonth();
  $('#f-formonth').addEventListener('change', () => { forMonthTouched = true; });
  $('#f-member').addEventListener('change', () => { if (!forMonthTouched) fillForMonth(); });

  // ── Receipt lines: category, pets (none ticked = All pets) and amount per line ──
  const startLines = existing?.type === 'expense' ? txnLines(existing)
    : prefill?.type === 'expense'
      ? [{ category_id: prefill.category_id ?? null, pet_ids: prefill.pet_id ? [prefill.pet_id] : [], amount_cents: prefill.amount_cents ?? null }]
      : [{ category_id: null, pet_ids: [], amount_cents: null }];
  const lines = startLines.map(l => ({ ...l, pet_ids: [...l.pet_ids], text: l.amount_cents ? fromCents(l.amount_cents).toFixed(2) : '' }));

  const petsFor = l => state.pets.filter(p => p.active || l.pet_ids.includes(p.id));
  const kindNote = l => (state.categories.find(c => c.id === l.category_id)?.kind === 'want'
    ? ' <span class="muted" style="font-weight:400">(a want)</span>' : '');
  function updateTotal() {
    const total = sumCents(lines.map(l => parseAmount(l.text) ?? 0));
    $('[data-total]').textContent = formatRM(total);
  }
  function drawLines() {
    const many = lines.length > 1;
    $('[data-lines]').innerHTML = lines.map((l, i) => `
      <div class="line-card" data-i="${i}" style="border-left-color:${l.pet_ids.length ? petColor(state.pets.find(p => p.id === l.pet_ids[0]) ?? {}, state.pets) : 'var(--line-strong)'}">
        <div class="row" style="margin-bottom:8px">
          <strong class="small">${many ? `Line ${i + 1}` : 'What was bought'}${kindNote(l)}</strong>
          ${many ? '<button type="button" class="link-btn small" data-remove>Remove</button>' : ''}
        </div>
        <div class="field"><label>Category</label>
          <select data-cat>${options(choices(state.categories, l.category_id), l.category_id, 'Choose…')}</select></div>
        <div class="field"><label>For</label>
          <div class="chips">
            <button type="button" class="pettag small${l.pet_ids.length ? ' off' : ''}" style="background:var(--ink);color:var(--paper)" data-allpets aria-pressed="${!l.pet_ids.length}">${icon('paw', 16)}<span class="name">All pets</span></button>
            ${petsFor(l).map(p => petTag(p, state.pets, { button: true, small: true, on: l.pet_ids.includes(p.id) })).join('')}
          </div></div>
        <div class="field" style="margin-bottom:0"><label>Amount (RM)</label>
          <input data-amt inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(l.text)}"></div>
      </div>`).join('');
    $('[data-lines]').querySelectorAll('.line-card').forEach(card => {
      const l = lines[Number(card.dataset.i)];
      card.querySelector('[data-cat]').addEventListener('change', e => { l.category_id = e.target.value || null; drawLines(); });
      card.querySelector('[data-amt]').addEventListener('input', e => { l.text = e.target.value; updateTotal(); });
      card.querySelector('[data-allpets]').addEventListener('click', () => { l.pet_ids = []; drawLines(); });
      card.querySelectorAll('[data-pet]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.pet;
        l.pet_ids = l.pet_ids.includes(id) ? l.pet_ids.filter(x => x !== id) : [...l.pet_ids, id];
        drawLines();
      }));
      card.querySelector('[data-remove]')?.addEventListener('click', () => { lines.splice(Number(card.dataset.i), 1); drawLines(); });
    });
    updateTotal();
  }
  $('[data-add-line]').addEventListener('click', () => {
    const last = lines.at(-1);
    lines.push({ category_id: null, pet_ids: last ? [...last.pet_ids] : [], amount_cents: null, text: '' });
    drawLines();
  });
  drawLines();

  const claimHint = () => { $('[data-claim-hint]').hidden = !$('#f-paidby').value; };
  $('#f-paidby').addEventListener('change', claimHint);
  claimHint();

  async function showReceipt() {
    const box = $('[data-receipt]');
    if (receiptBlob) {
      box.innerHTML = `<img class="receipt-preview" alt="Receipt preview"><button type="button" class="link-btn small">Remove photo</button>`;
      const img = box.querySelector('img');
      img.src = URL.createObjectURL(receiptBlob);
      img.onload = () => URL.revokeObjectURL(img.src);
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
    ['amount', 'lines', 'save'].forEach(k => err(k));
    const isExpense = type === 'expense';
    const parsedLines = lines.map(l => ({ category_id: l.category_id, pet_ids: l.pet_ids, amount_cents: parseAmount(l.text) }));
    let amount_cents;
    if (isExpense) {
      const msg = linesError(parsedLines);
      if (msg) { err('lines', msg); return; }
      amount_cents = sumCents(parsedLines.map(l => l.amount_cents));
    } else {
      amount_cents = parseAmount($('#f-amount').value);
      if (amount_cents == null) { err('amount', 'Enter an amount above 0, up to 2 decimals.'); return; }
    }

    const paidBy = isExpense ? ($('#f-paidby').value || null) : null;
    const txn = {
      id: txnId,
      type,
      date: $('#f-date').value || todayMY(),
      amount_cents,
      member_id: isExpense ? null : $('#f-member').value,
      for_month: isExpense ? null : `${$('#f-formonth').value}-01`,
      lines: isExpense ? parsedLines : null,
      category_id: isExpense ? parsedLines[0].category_id : null,
      pet_id: null,   // filled from the lines by db.saveTxn
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
