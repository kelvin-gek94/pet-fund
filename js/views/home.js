// Home dashboard: fund position, this month's contributions, due items, claims, summary sharing.
import { state, toast, nameOf } from '../app.js';
import { formatRM } from '../money.js';
import { todayMY, monthKey } from '../dates.js';
import {
  cashInFund, availableCents, avgMonthlySpend, runway, contributionsInMonth,
  pendingClaims, dueSoon, backupReminderDays,
} from '../calc.js';
import { buildSummary, summaryText, drawSummaryImage } from '../summary.js';
import { esc, shortDate } from '../ui.js';

export function render(el) {
  const today = todayMY();
  const { txns, settings } = state;
  const opening = settings.opening_balance_cents ?? 0;
  const reserve = settings.reserve_target_cents ?? 0;
  const cash = cashInFund(txns, opening);
  const avail = availableCents(txns, opening);
  const rw = runway(avail, reserve, avgMonthlySpend(txns, today));
  const contribs = contributionsInMonth(txns, state.members, monthKey(today));
  const due = dueSoon(state.upcoming, today);
  const claims = pendingClaims(txns);
  const backupDays = backupReminderDays(settings, state.me);

  el.innerHTML = `
    ${backupDays != null ? `
      <div class="banner warn row">
        <span>${backupDays === Infinity ? 'No backup yet' : `Last backup ${backupDays} days ago`}</span>
        <button class="btn" data-act="backup">Back up now</button>
      </div>` : ''}

    ${due.length ? `
      <a class="banner ${due.some(d => d.overdue) ? 'danger' : 'warn'}" href="#/more?tab=upcoming" style="display:block;text-decoration:none">
        <strong>Due soon</strong>
        ${due.map(d => `<div class="row small"><span>${esc(d.name)}</span>
          <span>${d.overdue ? 'Overdue · ' : ''}${shortDate(d.next_due)} · ~${formatRM(d.est_amount_cents)}</span></div>`).join('')}
      </a>` : ''}

    <div class="card">
      <div class="figures">
        <div><div class="muted small">Cash in fund</div><div class="figure num">${formatRM(cash)}</div></div>
        <div><div class="muted small">Available</div><div class="figure num">${formatRM(avail)}</div></div>
      </div>
      <div class="row" style="margin-top:10px">
        <span class="muted small">Runway</span>
        <strong>${rw.months == null ? '—' : `≈ ${rw.months} months`}</strong>
      </div>
      ${reserve > 0 ? `<div class="row small"><span class="muted">Reserve target</span><span>${formatRM(reserve)}</span></div>` : ''}
      ${rw.belowReserve ? `<div class="banner warn small" style="margin:10px 0 0">Available is below the ${formatRM(reserve)} reserve.</div>` : ''}
    </div>

    <div class="card">
      <h3>This month</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${contribs.map(c => c.total_cents > 0
          ? `<span class="chip ok">✓ ${esc(c.name)} ${formatRM(c.total_cents)}</span>`
          : `<span class="chip">${esc(c.name)} · not yet</span>`).join('')}
      </div>
    </div>

    ${claims.length ? `
      <a class="card" href="#/more?tab=claims" style="display:block;color:inherit;text-decoration:none">
        <h3>To reimburse</h3>
        ${claims.map(c => `<div class="row small"><span>${esc(nameOf('members', c.member_id))}</span>
          <span class="num">${formatRM(c.total_cents)} · ${c.count} item${c.count > 1 ? 's' : ''}</span></div>`).join('')}
      </a>` : ''}

    <div class="btn-row">
      <button class="btn" data-act="copy">📋 Copy text</button>
      <button class="btn" data-act="share">🖼️ Share image</button>
    </div>`;

  const summary = () => buildSummary({ ...state, today });

  el.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(summaryText(summary()));
      toast('Copied — paste it in WhatsApp');
    } catch {
      toast("Couldn't copy on this device");
    }
  });

  el.querySelector('[data-act="share"]').addEventListener('click', async () => {
    const blob = await drawSummaryImage(summary());
    const file = new File([blob], `pet-fund-summary-${monthKey(today)}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch { /* user cancelled */ }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      toast('Image downloaded');
    }
  });

  el.querySelector('[data-act="backup"]')?.addEventListener('click', async e => {
    e.target.disabled = true;
    const { runBackup } = await import('../backup.js');
    await runBackup();
    render(el);
  });
}
