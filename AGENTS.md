<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Only admin may change or delete saved records; managers and accountants add and approve only — enforced by DB trigger guard_record_edits (why: user requirement, UI checks alone can be bypassed).
- Role "accountant" (Account Manager) lands on /accounts and may add payments, bank deposits, expenses, petty cash (why: money-only desk role).
- Admin record deletion goes through the admin_void_record DB function via the AdminDelete component (why: one place reverses ledger, bank mirror and lubricant stock, and checks admin server-side).
- Tank → purchased oil return: tank_returns table + record_tank_return() add back into purchased_oil_litres (why: return keeps an audit row and dips)
- Tank → purchased oil returns are stored per shift in shift_stock.returned_litres; book closing = opening + received − returned − sold (why: a return is not a shortage, and reports must match the app's purchased-oil figure).
- Due-sale amounts are checked in the database (trigger check_credit_sale_amount): above zero, and equal to litres × rate when both are given (why: managers can save due sales directly).
- Only admin can set a new party's opening due and credit limit; for other roles a trigger forces both to 0 on insert (why: stops staff inventing debts).
- shift_summary is derived, one row per closed shift, written only by refresh_shift_summary() (trigger on close and on stock-chain changes) and recalculate_shift(); never insert or edit it by hand and never read it as the book of record (why: the books of record stay shift_sales, shift_stock and cash_reconciliation; the summary is a fast, joinless copy for dashboards and the "what was saved" screen).
- Admin corrections to saved records go through admin_edit_record() (allow-listed columns, a reason for the audit trail, shift recalculated in the same transaction) or admin_void_record(); never a bare UPDATE from the browser (why: the reason would not reach audit_log, the shift would be left stale, and ledger-linked amounts would drift from party balances).
- Stock traffic lights use stockLight() with the thresholds from the settings table (variance_threshold_pct, variance_warn_pct, variance_floor_litres) and the database's own variance_flagged verdict; do not hardcode 0.3 / 0.5 in components (why: the screen and the sign-off rule must never disagree).
- The role value 'manager' is labelled "Pump Manager" and 'dispenser' is labelled "Dispenser" in both languages; do not give two roles the same label (why: the People list and invite dropdown would show two identical options).
- FormWindow renders through a portal; keep it that way (why: a window opened inside a table cell or a blurred card would otherwise be positioned against that ancestor, not the screen).
- Migration files in drizzle/migrations must also be listed in drizzle/migrations/meta/_journal.json (why: the journal decides apply order).
