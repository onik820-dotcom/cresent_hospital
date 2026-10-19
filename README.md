# SmartKaj AI — M/S. J.H.M. Filling Station

Shift-by-shift operations for a single fuel station: meter readings and tank dips, cash and credit sales, expenses, bank, dues, lubricants, stock and tanker refills, a daily sheet and profit & loss — in English and Bangla, on a phone or a PC.

Built with React 19, TypeScript, TanStack Start/Router, Tailwind 4 and Supabase (Postgres + RLS), originally generated in [Lovable](https://lovable.dev).

## Roles

| Role (database value) | Label in the app | Lands on | Can |
| --- | --- | --- | --- |
| `dispenser` | Dispenser | `/dispenser` | Photograph meters and enter tank dips only |
| `manager` | Pump Manager | `/manager` | Open and close shifts, refills, oil purchase, stock |
| `accountant` | Account Manager | `/accounts` | Cash, bank, dues, expenses, petty cash — adds, never edits |
| `md` | Managing Director | `/md` | Read-only: dashboard, reports, assistant |
| `admin` | Accounts / Owner | `/admin` | Everything, including correcting or deleting saved records |

Only the admin may change or delete a saved record. That rule is enforced by a database trigger (`guard_record_edits`), not just by hiding buttons.

## Getting started

```sh
cp .env.example .env      # fill in your Supabase project values
bun install               # or: npm install
bun run dev               # opens at the address Vite prints
bun run build             # production build
```

`.env` holds only the Supabase **URL and publishable key** (both safe to ship to a browser). It is git-ignored; `.env.example` lists the names.

> `bun.lock` points at Lovable's package mirror. Outside Lovable, `npm install --no-package-lock` against the public registry works too.

## First run: create the first admin

A new database has no accounts, and nobody can create the first one from inside the app (accounts are made by an admin; `provision_account()` is deliberately closed to every signed-in role). Run this **once** in the Supabase dashboard → SQL Editor:

```sql
select public.provision_account(
  'owner@your-station.example',          -- the owner's email
  '<a strong password, 10+ characters>',
  'admin',
  'Owner Full Name'
);
```

The sign-in screen shows these instructions by itself whenever no active admin exists. After that, everyone else is created from **People** inside the app.

## Database and migrations

The schema lives in `drizzle/migrations/` (applied in the order listed in `drizzle/migrations/meta/_journal.json`; `supabase/migrations/` is the older mirror of the first 33). Lovable applies new files automatically; elsewhere, run them in order in the SQL Editor.

Added in the improvement round (all idempotent, none changes existing data):

| Migration | What it does |
| --- | --- |
| `0078_fix_accountant_invitation` | An admin can invite an **accountant** (the constraint and `create_invitation()` only allowed manager/dispenser) |
| `0079_shift_summary` | Derived `shift_summary` row per closed shift (refreshed by trigger), and the admin-only `recalculate_shift()` |
| `0080_first_run_and_calculation_thresholds` | `admin_exists()` for the first-run notice; seeds the missing threshold settings without touching existing ones |
| `0081_avco_rounding_from_settings` | Average-cost rounding reads `settings.avco_rounding_decimals` (default 4 — unchanged until you change it) |
| `0082_admin_edit_record` | `admin_edit_record()`: audited, allow-listed correction of expenses / bank lines / credit-sale text, recalculating the shift in the same transaction |
| `0083_recalculate_after_admin_changes` | Deleting a record, or correcting a bank line, also recalculates a closed shift |

## What the app does differently now

- **Navigation** — four labelled groups (Operations, Finance, Reports, Settings): a sidebar on a PC, bottom tabs on a phone.
- **Dashboard** — four key figures always visible (sales, litres, cash in drawer, dues) with the rest behind *See more*; quick-entry buttons; shift status bar; tank gauges; folded activity log.
- **Shift close** — six steps instead of eleven (every field kept), a **Quick entry** single-page mode, and a live panel (litres, expected drawer, cash variance, stock variance with a traffic light) that asks the database itself, so what you see is what sign-off will use. Test fire is pre-filled for you to confirm; a changed price is flagged. After sign-off the confirmation screen reads back what was actually saved.
- **Admin corrections** — a pencil beside each correctable record (with a reason and a "this will recalculate the shift" confirmation), a **Details** view per closed shift (summary, records, audit trail, *Recalculate*), and an "edited by" pencil on changed lines.
- **Reports** — Print and Export PDF (the print rules always produce the full paper form, even from a phone), a short phone card for the daily sheet, Last month / Custom range, P&L health light and CSV export, traffic lights on the stock-variance report.
- **Settings** — *Calculation thresholds*, *Shift defaults* and *Report labels* (where the daily-sheet captions are checked against the paper form, once).

### Thresholds

Settings → Calculation thresholds writes the same `settings` rows the database reads (`variance_threshold_pct`, `variance_floor_litres`, `cash_variance_tolerance`), so the screen and the sign-off rules cannot disagree. Defaults: red above 0.5 % of litres sold, yellow from 0.3 %, gaps up to 7 L ignored, cash tolerance ৳0 (any difference needs a reason — raise it if you want a ৳100 allowance).

### What an admin can and cannot edit in place

| Record | In place | Why |
| --- | --- | --- |
| Expense | amount, category, paid-by, description | The bank mirror follows automatically |
| Bank line you typed | amount, bank, account, reference | Lines copied from a payment/expense are edited at the source |
| Credit sale | vehicle, challan | The party ledger was posted from the amount — delete and re-enter to change it |
| Meter reading, tank dip | — | They re-price the whole shift: *Edit* the shift (reopen → re-close) |
| Payment, lubricant movement | — | Tied to party ledgers / shelf stock: delete and re-enter |

`recalculate_shift()` re-reads saved expenses, credit sales, dues, bank deposits and closing dips and rewrites the shift's cash and stock figures (and later shifts' stock chain). It never changes counted cash, meter readings or test litres.

## Known limitations

- **Single station.** The station UUID is `00000000-0000-0000-0000-000000000001` by design. Multi-station is a future phase.
- **Shift times are fixed** (day 10:00–22:00, night 22:00–10:00, Asia/Dhaka), so "open the shift at the time the manager taps the button" is not offered; the status bar shows who opened it and when.
- The Daily Sheet's captions are a best guess until an admin confirms them in Settings → Report labels.

See `AGENTS.md` for the invariants to keep when changing the code.
