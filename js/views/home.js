// Home: are the pets covered, what each pet cost this month, who has chipped in, what's due.
import { state, toast, nameOf } from '../app.js';
import { formatRM } from '../money.js';
import { todayMY, monthKey } from '../dates.js';
import {
  cashInFund, availableCents, avgMonthlySpend, runway, contributionsInMonth,
  pendingClaims, dueSoon, backupReminderDays, paidAhead, spendBy,
} from '../calc.js';
import { buildSummary, summaryText, drawSummaryImage } from '../summary.js';
import { esc, monthLabel } from '../ui.js';
import { petTag } from '../pets.js';
import { coveredSentence, fullMonthName } from '../words.js';
import { icon } from '../icons.js';

const dayMonth = d => `${Number(d.slice(8, 10))} ${monthLabel(d.slice(0, 7)).slice(0, 3)}`;

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
  const ahead = paidAhead(txns, state.members, today);

  const month = monthKey(today);
  const perPet = spendBy(txns, 'pet_id', `${month}-01`, `${month}-31`);
  const shared = perPet.get(null) ?? 0;
  const pets = state.pets.filter(p => p.active);

  el.innerHTML = `
    ${backupDays != null ? `
      <div class="banner warn row">
        <span>${backupDays === Infinity ? 'No backup yet.' : `Last backup was ${backupDays} days ago.`}</span>
        <button class="btn" data-act="backup">Back up now</button>
      </div>` : ''}

    <p class="headline">${esc(coveredSentence(rw))}</p>
    <p class="subline num">${formatRM(avail)} available<br>${formatRM(cash)} in the fund account${reserve > 0 ? `<br>Keeping ${formatRM(reserve)} in reserve` : ''}</p>

    <div class="tagrow" aria-label="Spending per pet this month">
      ${pets.map(p => petTag(p, state.pets, { amount: formatRM(perPet.get(p.id) ?? 0) })).join('')}
    </div>
    ${shared > 0 ? `<p class="muted small" style="margin:2px 0 0">Plus ${formatRM(shared)} shared by all pets this month.</p>` : ''}

    <h3>${fullMonthName(month)} chip-ins</h3>
    <ul class="rows">
      ${contribs.map(c => `<li>
        <span class="tick">${c.total_cents > 0 ? '✓' : ''}</span>
        <span class="grow">${esc(c.name)}</span>
        <span class="end num ${c.total_cents > 0 ? '' : 'warn-text'}">${c.total_cents > 0 ? formatRM(c.total_cents) : 'not yet'}</span>
      </li>`).join('')}
    </ul>

    <div class="facts">
      ${ahead.length ? `<div><span>Paid ahead</span><span>${ahead.map(a => `${esc(a.name)} for ${fullMonthName(a.month)}`).join('<br>')}</span></div>` : ''}
      ${due.length ? `<div><span>Due soon</span><a href="#/more?tab=upcoming" style="text-decoration:none">${due.map(d =>
        `<span class="${d.overdue ? 'out' : ''}">${esc(d.name)}, ${d.overdue ? 'overdue since ' : ''}${dayMonth(d.next_due)}</span>`).join('<br>')}</a></div>` : ''}
      ${claims.length ? `<div><span>To pay back</span><a href="#/more?tab=claims" style="text-decoration:none">${claims.map(c =>
        `${esc(nameOf('members', c.member_id))}, <span class="num">${formatRM(c.total_cents)}</span>`).join('<br>')}</a></div>` : ''}
    </div>

    <div class="btn-row">
      <button class="btn" data-act="copy">${icon('copy', 18)}Copy for WhatsApp</button>
      <button class="btn" data-act="share">${icon('photo', 18)}Share image</button>
    </div>`;
  const summary = () => buildSummary({ ...state, today });

  el.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(summaryText(summary()));
      toast('Copied. Paste it in the family chat.');
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
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
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
