# Pet Fund Cash Flow Tracker — Design Spec

Date: 2026-10-03 · Owner: Kelvin · Status: draft for review

## 1. Purpose

A private, phone-first web app for five siblings who pool money monthly to pay for the family pets. It replaces ad-hoc tracking with one shared, always-current record of money in, money out, and who is owed what.

- **Contributors:** Kelvin, Vincent, Desmond, Jolyn, Dickson
- **Pets:** Murphy, Panda, Watson, Mochi, Poppy
- **Currency:** RM only
- **Starts fresh** — no import of past spreadsheets. A one-time opening balance carries the history forward.
- **Fully separate** from the RB apps: own folder, own Supabase project, own GitHub repo.

**Success looks like:** any sibling can open the link on their phone, sign in with Google, see the fund's true position, log a contribution or expense in under 30 seconds, and Kelvin can post a monthly summary to the sibling WhatsApp group in one tap.

## 2. How the money actually flows

- The fund's money sits in **Kelvin's personal bank account**. Siblings transfer their contribution there monthly.
- Contributions are **"whatever they can"** — no fixed amount, no overdue concept.
- An expense is paid either **by the Fund** (from Kelvin's account) or **by a sibling out of pocket**. Out-of-pocket expenses become **claims** that Kelvin settles by **transferring back** (no offsetting against contributions).

## 3. Data model (Supabase Postgres)

| Table | Fields | Notes |
|---|---|---|
| `members` | id, name, email (nullable, unique), active | The 5 siblings. A member **with** an email may sign in; a member **without** an email is a contributor-only record (e.g. a parent who chips in occasionally) and cannot sign in. |
| `pets` | id, name, active | Seeded with the 5 pets. Inactive pets stay on old records but drop out of pickers. |
| `categories` | id, name, active | Seeded: Food, Vet, Grooming, Medication, Supplies, Insurance, Other. Editable. |
| `transactions` | id, type (`contribution`\|`expense`), date, amount (numeric 12,2, > 0), member_id, pet_id (nullable = All pets), category_id, paid_to (text, nullable), note, receipt_path, paid_by_member_id (nullable = Fund), reimbursed_on (date, nullable), deleted_at (nullable), created_by, created_at, updated_by, updated_at | One row per money movement. See rules below. |
| `upcoming` | id, name, est_amount, pet_id (nullable), category_id, frequency (`monthly`\|`every_n_months`\|`yearly`), every_n (int, nullable), next_due, active | Recurring expected costs. |
| `settings` | single row: opening_balance (default 0), reserve_target (default 0), last_backup_at, last_backup_by | |

**Transaction rules**
- `contribution`: requires `member_id`; pet/category/paid_by/reimbursed_on are null.
- `expense`: requires `category_id`; `member_id` null; `paid_to` is the shop/vet name (optional).
  - `paid_by_member_id` null → paid by Fund.
  - `paid_by_member_id` set → a **claim**; pending while `reimbursed_on` is null.
- **Soft delete:** `deleted_at` set hides the row everywhere; restorable from History. All calculations ignore soft-deleted rows.

## 4. Calculations (pure functions, unit-tested)

- **Cash in fund** = opening_balance + Σ contributions − Σ fund-paid expenses − Σ reimbursed claims.
  (A claim only reduces cash once reimbursed; this should match Kelvin's bank-side fund money.)
- **Pending claims** = Σ claim expenses where `reimbursed_on` is null, grouped by sibling.
- **Available** = Cash in fund − Pending claims.
- **Monthly spend** = Σ all expenses dated in the month (fund-paid **and** claims — spending counts when it happens).
- **Runway** = (Available − reserve_target) ÷ average monthly spend over the last 3 complete months. Displayed as "≈ X months".
  - Fewer than 3 complete months of data (fresh start) → average over the complete months available; with none yet, use the current month to date.
  - Avg spend = 0 → show "—" (no spending data).
  - Available below reserve → runway shows 0 and the reserve warning is shown in amber.
- **This month per sibling** = Σ contributions by that member dated in the current calendar month → "✓ RM x" or "Not yet".
- **Upcoming due** = active items with `next_due` ≤ today + 7 days (overdue items flagged).
- **Mark paid (upcoming)** → opens Add Expense prefilled (amount editable); on save, advances `next_due` by its frequency (month-end dates clamp, e.g. 31 Jan + 1 month = 28/29 Feb).

## 5. Screens (single-page app, bottom tab bar)

1. **Home** — Cash in fund, Available, Runway + reserve status; "This month" chips for each sibling; upcoming-due banner; pending-claims card; **Copy summary** and **Share image** buttons.
2. **Add (+)** — Contribution | Expense toggle.
   - Contribution: member (defaults to signed-in user), amount, date (default today), note.
   - Expense: amount, date, pet (or All pets), category, paid to, paid by (Fund / sibling), note, receipt (camera or gallery).
3. **History** — newest first; filters for month, type, pet, category, person; each row shows "added by X". Tap → edit / view receipt / delete. Toggle to show deleted rows → restore.
4. **Reports** — choose month or year: spend by category (bars), spend by pet (bars), contributions per sibling, in-vs-out trend by month.
5. **More** — Upcoming (add/edit/Mark paid), Claims (Mark reimbursed with date), Settings (opening balance, reserve target, pets, categories, members & emails).

## 6. WhatsApp summary (two formats)

- **Copy (text table):** monospace block wrapped in ``` so columns align; ≤ 30 chars wide. Sections: Cash / Available / Runway; Contributions per sibling + total; Spending by category + total; Claims; Due soon.
- **Share image:** the same content drawn as a table on a canvas → PNG → Web Share API (share sheet → WhatsApp). Fallback where sharing files isn't supported: download the PNG.

## 7. Security

- **Auth:** Supabase Auth with **Google sign-in only**.
- **Allowlist:** a database function `is_member()` returns true when the signed-in user's email matches an active `members.email`. Non-members see "Not authorised" and are signed out.
- **Row Level Security** on every table: select/insert/update allowed only when `is_member()`; no hard deletes (soft delete only). Enforced server-side, so the public anon key + URL alone exposes nothing.
- **Receipts:** private Storage bucket, same `is_member()` policy; viewed via signed URLs (10-minute expiry); images resized client-side (max ~1600 px, JPEG) before upload. Users are advised to crop bank account numbers from transfer slips.
- **Audit:** `created_by` / `updated_by` set by database defaults/triggers from the auth user, not trusted from the client.
- **Repo hygiene:** the repo contains code only — no data, no service-role key.

## 8. Build & hosting

- Static site, no build step: `index.html` + native ES modules, Supabase JS client from CDN. Money, date, calculation and summary logic live in pure modules so they can be unit-tested.
- Hosted on **GitHub Pages**; installable to home screen (web manifest + icon).
- `supabase/schema.sql` — tables, seed data, RLS policies, storage bucket policies, triggers — pasted once into the Supabase SQL editor.

**Manual setup steps for Kelvin (guided):**
1. Create a new free Supabase project; run `schema.sql`.
2. Create a Google OAuth client in Google Cloud Console; paste Client ID/Secret into Supabase Auth → Google; add the GitHub Pages URL as a redirect.
3. Create a GitHub repo and enable Pages.
4. Enter each sibling's Gmail address into `members` (Kelvin = his personal Gmail). Emails are entered directly in the Supabase dashboard / app Settings — **never committed to the repo**, since a free GitHub Pages repo is public. `schema.sql` seeds member names with null emails.

## 9. Testing

- **Unit tests** (browser test page `tests/index.html` served by a PowerShell dev server — no Node/Python on this PC) for the pure modules: cash/available with pending vs reimbursed claims, soft-deleted rows excluded, empty months, runway with zero spend, reserve above balance, month-end due-date rollover, summary text width ≤ 30 chars.
- **Browser check** at phone width: sign-in gate, add/edit/delete/restore, claim → reimburse, upcoming → mark paid, both summary formats.
- **RLS check:** with a non-allowlisted account (or anon key only), confirm zero rows are returned and inserts are rejected.

## 10. Out of scope (YAGNI)

Push notifications (reminders are in-app only), offline mode, multiple funds, non-RM currencies, offsetting claims against contributions, importing past spreadsheets, Excel/CSV export, per-pet health records.

## 11. Keep-alive (prevents free-tier pausing)

Supabase free tier pauses a project after ~7 days with no activity.

- A database function `ping()` returns `'ok'` and is callable with the anon key. It reads no tables, so RLS stays fully closed.
- `.github/workflows/keepalive.yml` runs **every 3 days** on GitHub Actions and calls `ping()` via the REST API. Supabase URL + anon key are stored as repo secrets.
- GitHub disables scheduled workflows after 60 days with no repo activity; the workflow includes a step that re-enables itself via the GitHub API so it keeps running indefinitely.
- If a ping fails, the workflow run fails and GitHub emails Kelvin.

## 12. Backups

- **Folder:** `PETS\Pet Fund Backups` on Kelvin's PC — outside the repo (never on GitHub), cloud-synced.
- **Settings → Back up now** (any member can use it) downloads `pet-fund-backup-YYYY-MM-DD.zip` containing:
  - `data.json` — every table, including soft-deleted rows, plus a schema version number.
  - `receipts/` — every receipt image, fetched through signed URLs.
  Built in the browser with JSZip (CDN). Kelvin saves it into the backup folder.
- `settings.last_backup_at` / `last_backup_by` are recorded on each backup.
- **Reminder:** when the last backup is more than 7 days old, Kelvin's Home screen shows "Last backup N days ago — Back up now". Other members don't see it.
- **Restore** is a documented manual procedure (`docs/restore.md`: load `data.json` into a fresh project and re-upload receipts), not an in-app button.
