// More: Upcoming costs, Claims to reimburse, Settings.
import { state, refresh, navigate, toast, nameOf } from '../app.js';
import * as db from '../db.js';
import { formatRM, parseAmount, parseBalance, fromCents, sumCents } from '../money.js';
import { todayMY, addDays } from '../dates.js';
import { pendingClaims } from '../calc.js';
import { esc, options, openSheet, shortDate, choices } from '../ui.js';

const TABS = { upcoming: 'Upcoming', claims: 'Claims', settings: 'Settings' };
const FREQ = { monthly: 'Monthly', every_n_months: 'Every N months', yearly: 'Yearly' };

export function render(el, params) {
  const tab = TABS[params.tab] ? params.tab : 'upcoming';
  el.innerHTML = `
    <div class="segmented" style="grid-template-columns:repeat(3,1fr)">
      ${Object.entries(TABS).map(([k, v]) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}">${v}</button>`).join('')}
    </div>
    <div id="m-body"></div>`;
  el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => navigate('more', { tab: b.dataset.tab })));
  const body = el.querySelector('#m-body');
  ({ upcoming: renderUpcoming, claims: renderClaims, settings: renderSettings })[tab](body);
}

async function guarded(fn, okMsg) {
  try {
    await fn();
    await refresh();
    if (okMsg) toast(okMsg);
    return true;
  } catch (ex) {
    toast(`Couldn't save: ${ex.message}`);
    return false;
  }
}

// ───── Upcoming ─────

function renderUpcoming(body) {
  const today = todayMY();
  const items = state.upcoming.filter(u => u.active);
  body.innerHTML = `
    <button class="btn btn-primary btn-block" data-a="new">＋ Add upcoming cost</button>
    <div class="card" style="margin-top:12px">
      ${items.length ? `<ul class="list">${items.map(u => `
        <li>
          <div class="row"><strong>${esc(u.name)}</strong><span class="num">~${formatRM(u.est_amount_cents)}</span></div>
          <div class="row small muted">
            <span>${u.pet_id ? esc(nameOf('pets', u.pet_id)) : 'All pets'} · ${u.frequency === 'every_n_months' ? `Every ${u.every_n} months` : FREQ[u.frequency]}</span>
            <span class="${u.next_due < today ? 'out' : ''}">${u.next_due < today ? 'Overdue · ' : 'Due '}${shortDate(u.next_due)}</span>
          </div>
          <div class="row" style="margin-top:8px;justify-content:flex-start;gap:16px">
            <button class="link-btn" data-pay="${u.id}">✓ Mark paid</button>
            <button class="link-btn" data-edit="${u.id}">Edit</button>
          </div>
        </li>`).join('')}</ul>` : '<p class="muted">No upcoming costs yet. Add things like monthly food or yearly vaccinations.</p>'}
    </div>`;
  body.querySelector('[data-a="new"]').addEventListener('click', () => upcomingForm(null, () => renderUpcoming(body)));
  body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () =>
    upcomingForm(state.upcoming.find(u => u.id === b.dataset.edit), () => renderUpcoming(body))));
  body.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', () => {
    const u = state.upcoming.find(x => x.id === b.dataset.pay);
    state.prefill = {
      type: 'expense', amount_cents: u.est_amount_cents, pet_id: u.pet_id, category_id: u.category_id,
      note: u.name, upcomingId: u.id,
    };
    navigate('add');
  }));
}

function upcomingForm(item, done) {
  const u = item ?? { name: '', est_amount_cents: 0, pet_id: null, category_id: null, frequency: 'monthly', every_n: null, next_due: todayMY(), active: true };
  const sheet = openSheet(`
    <h3>${item ? 'Edit upcoming cost' : 'New upcoming cost'}</h3>
    <form novalidate>
      <div class="field"><label for="u-name">Name</label><input id="u-name" value="${esc(u.name)}" placeholder="e.g. Watson vaccination"></div>
      <div class="field"><label for="u-amt">Estimated amount (RM)</label>
        <input id="u-amt" inputmode="decimal" value="${u.est_amount_cents ? fromCents(u.est_amount_cents).toFixed(2) : ''}"></div>
      <div class="figures">
        <div class="field"><label for="u-cat">Category</label><select id="u-cat">${options(choices(state.categories, u.category_id), u.category_id, 'Choose…')}</select></div>
        <div class="field"><label for="u-pet">Pet</label><select id="u-pet">${options(choices(state.pets, u.pet_id), u.pet_id, 'All pets')}</select></div>
        <div class="field"><label for="u-freq">How often</label>
          <select id="u-freq">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}"${k === u.frequency ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field" data-n><label for="u-n">Every … months</label><input id="u-n" type="number" min="1" value="${u.every_n ?? 3}"></div>
      </div>
      <div class="field"><label for="u-due">Next due</label><input id="u-due" type="date" value="${u.next_due}"></div>
      <div class="error" data-err></div>
      <div class="btn-row">
        ${item ? '<button type="button" class="btn btn-danger" data-a="remove">Remove</button>' : '<button type="button" class="btn" data-a="cancel">Cancel</button>'}
        <button class="btn btn-primary" type="submit">Save</button>
      </div>
    </form>`);
  const $ = s => sheet.el.querySelector(s);
  const syncN = () => { $('[data-n]').hidden = $('#u-freq').value !== 'every_n_months'; };
  $('#u-freq').addEventListener('change', syncN);
  syncN();
  $('[data-a="cancel"]')?.addEventListener('click', sheet.close);
  $('[data-a="remove"]')?.addEventListener('click', async () => {
    if (!confirm(`Stop tracking "${u.name}"?`)) return;
    if (await guarded(() => db.saveUpcoming({ ...u, active: false }), 'Removed')) { sheet.close(); done(); }
  });
  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#u-name').value.trim();
    const amt = $('#u-amt').value.trim() === '' ? 0 : parseAmount($('#u-amt').value);
    const n = Number($('#u-n').value);
    const freq = $('#u-freq').value;
    const msg = !name ? 'Enter a name.'
      : amt == null ? 'Enter a valid amount.'
      : !$('#u-cat').value ? 'Choose a category.'
      : freq === 'every_n_months' && !(Number.isInteger(n) && n >= 1) ? 'Months must be a whole number, 1 or more.'
      : !$('#u-due').value ? 'Choose the next due date.' : '';
    $('[data-err]').textContent = msg;
    if (msg) return;
    const row = {
      ...u, name, est_amount_cents: amt, category_id: $('#u-cat').value, pet_id: $('#u-pet').value || null,
      frequency: freq, every_n: freq === 'every_n_months' ? n : null, next_due: $('#u-due').value,
    };
    if (await guarded(() => db.saveUpcoming(row), 'Saved')) { sheet.close(); done(); }
  });
}

// ───── Claims ─────

function renderClaims(body) {
  const pending = pendingClaims(state.txns);
  const live = state.txns.filter(t => !t.deleted_at && t.paid_by_member_id);
  const since = addDays(todayMY(), -90);
  const recent = live.filter(t => t.reimbursed_on && t.reimbursed_on >= since)
    .sort((a, b) => b.reimbursed_on.localeCompare(a.reimbursed_on));

  body.innerHTML = `
    ${pending.length ? pending.map(c => {
      const items = live.filter(t => !t.reimbursed_on && t.paid_by_member_id === c.member_id);
      return `<div class="card">
        <div class="row"><h3>${esc(nameOf('members', c.member_id))}</h3><strong class="num">${formatRM(c.total_cents)}</strong></div>
        <ul class="list">${items.map(t => `
          <li class="row small">
            <span>${shortDate(t.date)} · ${esc(nameOf('categories', t.category_id))}${t.paid_to ? ` · ${esc(t.paid_to)}` : ''}<br>
              <span class="num">${formatRM(t.amount_cents)}</span></span>
            <button class="btn" data-one="${t.id}">Reimbursed</button>
          </li>`).join('')}</ul>
        ${items.length > 1 ? `<button class="btn btn-primary btn-block" data-all="${c.member_id}">Reimbursed all ${formatRM(c.total_cents)}</button>` : ''}
      </div>`;
    }).join('') : '<div class="card muted">Nothing to reimburse. 🎉</div>'}
    ${recent.length ? `<div class="card"><h3>Reimbursed (last 90 days)</h3><ul class="list">${recent.map(t => `
      <li class="row small"><span>${esc(nameOf('members', t.paid_by_member_id))} · ${shortDate(t.date)}</span>
        <span class="num">${formatRM(t.amount_cents)} · paid ${shortDate(t.reimbursed_on)}</span></li>`).join('')}</ul></div>` : ''}`;

  const ask = (ids, total) => {
    const sheet = openSheet(`
      <h3>Mark reimbursed</h3>
      <p class="muted small">${formatRM(total)} transferred back</p>
      <div class="field"><label for="c-date">Transfer date</label><input id="c-date" type="date" value="${todayMY()}" max="${todayMY()}"></div>
      <div class="btn-row"><button class="btn" data-a="cancel">Cancel</button><button class="btn btn-primary" data-a="ok">Confirm</button></div>`);
    sheet.el.querySelector('[data-a="cancel"]').addEventListener('click', sheet.close);
    sheet.el.querySelector('[data-a="ok"]').addEventListener('click', async () => {
      const date = sheet.el.querySelector('#c-date').value || todayMY();
      if (await guarded(() => Promise.all(ids.map(id => db.markReimbursed(id, date))), 'Marked reimbursed')) {
        sheet.close();
        renderClaims(body);
      }
    });
  };
  body.querySelectorAll('[data-one]').forEach(b => b.addEventListener('click', () => {
    const t = live.find(x => x.id === b.dataset.one);
    ask([t.id], t.amount_cents);
  }));
  body.querySelectorAll('[data-all]').forEach(b => b.addEventListener('click', () => {
    const items = live.filter(t => !t.reimbursed_on && t.paid_by_member_id === b.dataset.all);
    ask(items.map(t => t.id), sumCents(items.map(t => t.amount_cents)));
  }));
}

// ───── Settings ─────

function renderSettings(body) {
  const s = state.settings;
  const listEditor = (key, title, extra = () => '') => `
    <div class="card" data-list="${key}">
      <h3>${title}</h3>
      <ul class="list">${state[key].map(x => `
        <li class="row">
          <span>${esc(x.name)}${x.active ? '' : ' <span class="tag">hidden</span>'}${extra(x)}</span>
          <button class="link-btn" data-edit="${x.id}">Edit</button>
        </li>`).join('')}</ul>
      <button class="btn btn-block" data-add>＋ Add</button>
    </div>`;

  body.innerHTML = `
    <div class="card">
      <h3>Fund</h3>
      <form data-fund novalidate>
        <div class="field"><label for="s-open">Opening balance (RM)</label>
          <input id="s-open" inputmode="decimal" value="${fromCents(s.opening_balance_cents ?? 0).toFixed(2)}">
          <p class="muted small">Money already in the fund before you started using this app. Can be negative.</p></div>
        <div class="field"><label for="s-res">Reserve target (RM)</label>
          <input id="s-res" inputmode="decimal" value="${fromCents(s.reserve_target_cents ?? 0).toFixed(2)}">
          <p class="muted small">Emergency buffer to keep for surprise vet bills.</p></div>
        <div class="error" data-err></div>
        <button class="btn btn-primary btn-block" type="submit">Save</button>
      </form>
    </div>
    <div class="card">
      <h3>Backup</h3>
      <p class="muted small">Last backup: ${s.last_backup_at ? `${new Date(s.last_backup_at).toLocaleString('en-MY')} by ${esc(nameOf('members', s.last_backup_by, '?'))}` : 'never'}</p>
      <p class="muted small">Save the file into <em>PETS\\Pet Fund Backups</em>.</p>
      <button class="btn btn-block" data-backup>💾 Back up now</button>
    </div>
    ${listEditor('members', 'Family members', m => m.email ? `<br><span class="muted small">${esc(m.email)}</span>` : '<br><span class="muted small">no email — cannot sign in</span>')}
    <p class="muted small" style="margin:-4px 0 12px">Only listed emails can sign in. New emails must also be added as Google test users.</p>
    ${listEditor('pets', 'Pets')}
    ${listEditor('categories', 'Categories')}
    <button class="btn btn-block" data-signout>Sign out</button>`;

  body.querySelector('[data-fund]').addEventListener('submit', async e => {
    e.preventDefault();
    const opening = parseBalance(body.querySelector('#s-open').value);
    const reserve = parseBalance(body.querySelector('#s-res').value);
    const msg = opening == null ? 'Opening balance is not a valid amount.'
      : reserve == null || reserve < 0 ? 'Reserve must be 0 or more.' : '';
    body.querySelector('[data-err]').textContent = msg;
    if (msg) return;
    if (await guarded(() => db.saveSettings({ opening_balance_cents: opening, reserve_target_cents: reserve }), 'Saved')) renderSettings(body);
  });

  body.querySelector('[data-backup]').addEventListener('click', async e => {
    e.target.disabled = true;
    const { runBackup } = await import('../backup.js');
    await runBackup();
    renderSettings(body);
  });

  body.querySelector('[data-signout]').addEventListener('click', () => db.signOut());

  const savers = { members: db.saveMember, pets: db.savePet, categories: db.saveCategory };
  body.querySelectorAll('[data-list]').forEach(card => {
    const key = card.dataset.list;
    const edit = row => listItemForm(key, row, savers[key], () => renderSettings(body));
    card.querySelector('[data-add]').addEventListener('click', () => edit(null));
    card.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => edit(state[key].find(x => x.id === b.dataset.edit))));
  });
}

function listItemForm(key, row, save, done) {
  const isMember = key === 'members';
  const r = row ?? { name: '', active: true, email: null, sort: state[key].length + 1 };
  const sheet = openSheet(`
    <h3>${row ? 'Edit' : 'Add'}</h3>
    <form novalidate>
      <div class="field"><label for="l-name">Name</label><input id="l-name" value="${esc(r.name)}"></div>
      ${isMember ? `<div class="field"><label for="l-email">Google email (optional)</label>
        <input id="l-email" type="email" autocomplete="off" value="${esc(r.email ?? '')}"></div>` : ''}
      <div class="field"><label><input id="l-active" type="checkbox" style="width:auto;min-height:0"${r.active ? ' checked' : ''}> Active (shown in pickers)</label></div>
      <div class="error" data-err></div>
      <div class="btn-row"><button type="button" class="btn" data-a="cancel">Cancel</button><button class="btn btn-primary" type="submit">Save</button></div>
    </form>`);
  const $ = s => sheet.el.querySelector(s);
  $('[data-a="cancel"]').addEventListener('click', sheet.close);
  $('form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#l-name').value.trim();
    const email = isMember ? ($('#l-email').value.trim().toLowerCase() || null) : undefined;
    const msg = !name ? 'Enter a name.' : email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? 'That email doesn\'t look right.' : '';
    $('[data-err]').textContent = msg;
    if (msg) return;
    if (isMember && row?.id === state.me.id && !$('#l-active').checked) {
      $('[data-err]').textContent = "You can't deactivate yourself.";
      return;
    }
    const out = { ...(row ?? {}), name, active: $('#l-active').checked, sort: r.sort };
    if (isMember) out.email = email;
    if (await guarded(() => save(out), 'Saved')) { sheet.close(); done(); }
  });
}
