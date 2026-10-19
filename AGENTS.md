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
