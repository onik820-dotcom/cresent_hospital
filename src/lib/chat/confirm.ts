import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';
import { recordExpense } from '@/components/expenses-actions';
import { recordCreditSale, recordPayment, saveParty, adjustBalance } from '@/components/dues-actions';
import { recordLubMovement, updateSkuRates } from '@/components/lubricants-actions';
import { setEquipmentStatus } from '@/components/stock-actions';
import { openCurrentShift } from '@/components/manager-actions';
import { EDITABLE_TABLES, type EditableTable, type Proposal } from '@/lib/chat/proposals';

/**
 * Carrying out a confirmed proposal.
 *
 * Nothing here is a shortcut around the app: every kind lands in the same
 * action the screen uses, so the same checks, the same triggers and the same
 * audit row apply. Edits and removals go straight to the table because there
 * is no screen for them yet — and RLS refuses them if the person may not.
 */

const str = (v: unknown) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
const opt = (v: unknown) => {
  const s = str(v).trim();
  return s ? s : undefined;
};

export async function applyProposal(
  proposal: Proposal,
): Promise<{ ok: boolean; error?: string }> {
  const p = proposal.payload;

  switch (proposal.kind) {
    case 'expense.create':
      return recordExpense({
        category_id: str(p.category_id),
        amount: str(p.amount),
        description: opt(p.description),
        paid_by: str(p.paid_by) as 'cash' | 'bank' | 'bkash' | 'nagad',
      });

    case 'credit_sale.create':
      return recordCreditSale({
        customer_id: str(p.customer_id),
        amount: str(p.amount),
        litres: opt(p.litres),
        rate: opt(p.rate),
        vehicle_no: opt(p.vehicle_no),
      });

    case 'payment.receive':
      return recordPayment({
        customer_id: str(p.customer_id),
        amount: str(p.amount),
        method: str(p.method) as 'cash' | 'bkash' | 'nagad' | 'bank' | 'cheque' | 'adjustment',
        reference: opt(p.reference),
        note: opt(p.note),
      });

    case 'party.save':
      return saveParty({
        id: opt(p.id),
        name: str(p.name),
        name_bn: opt(p.name_bn),
        type: str(p.type) as 'company' | 'individual' | 'govt',
        phone: opt(p.phone),
        address: opt(p.address),
        vehicle_numbers: opt(p.vehicle_numbers),
        credit_limit: str(p.credit_limit || '0'),
        opening_balance: str(p.opening_balance || '0'),
        is_active: p.is_active !== false,
      });

    case 'balance.adjust':
      return adjustBalance(str(p.customer_id), str(p.amount), str(p.reason));

    case 'lub.movement':
      return recordLubMovement({
        sku_id: str(p.sku_id),
        txn_type: str(p.txn_type) as 'purchase' | 'sale' | 'own_use' | 'adjustment',
        qty: str(p.qty),
        rate: opt(p.rate),
        customer_id: opt(p.customer_id),
        vehicle_ref: opt(p.vehicle_ref),
        note: opt(p.note),
      });

    case 'lub.rates':
      return updateSkuRates({
        sku_id: str(p.sku_id),
        purchase_rate: str(p.purchase_rate || '0'),
        sale_rate: str(p.sale_rate || '0'),
        reorder_level: str(p.reorder_level || '0'),
      });

    case 'equipment.status':
      return setEquipmentStatus({
        kind: str(p.kind) as 'tank' | 'dispenser',
        id: str(p.id),
        status: str(p.status) as 'active' | 'paused' | 'removed',
        reason: opt(p.reason),
      });

    case 'shift.open':
      return openCurrentShift();

    case 'record.edit':
      return editEntry(p);

    case 'record.void':
      return voidEntry(p);

    case 'shift.close':
      // Handled by the panel, which sends the person to the close wizard.
      return { ok: false, error: 'A shift is closed from the close wizard.' };

    default:
      return { ok: false, error: 'That is not something the assistant can carry out.' };
  }
}

function tableOf(value: unknown): EditableTable | null {
  const t = str(value) as EditableTable;
  return (EDITABLE_TABLES as readonly string[]).includes(t) ? t : null;
}

async function requireOps() {
  const profile = await getSessionProfile();
  return profile?.role === 'manager' || profile?.role === 'admin' ? profile : null;
}

async function editEntry(p: Proposal['payload']) {
  const profile = await requireOps();
  if (!profile) return { ok: false, error: 'Only a manager or an admin may edit an entry' };
  const table = tableOf(p.table);
  if (!table || !str(p.id)) return { ok: false, error: 'That entry could not be identified' };
  if (!str(p.reason).trim()) return { ok: false, error: 'An edit needs a reason' };

  const patch: Record<string, unknown> = { updated_by: profile.id };
  if (opt(p.amount)) patch[table === 'lub_transactions' ? 'qty' : 'amount'] = str(p.amount);
  if (opt(p.description)) patch[table === 'expenses' ? 'description' : 'note'] = str(p.description);
  if (Object.keys(patch).length === 1) return { ok: false, error: 'Nothing was given to change' };

  const supabase = await createClient();
  const { error } = await supabase.from(table).update(patch).eq('id', str(p.id));
  return error ? { ok: false, error: String(error.message ?? 'That entry could not be changed') } : { ok: true };
}

async function voidEntry(p: Proposal['payload']) {
  const profile = await requireOps();
  if (!profile) return { ok: false, error: 'Only a manager or an admin may remove an entry' };
  const table = tableOf(p.table);
  if (!table || !str(p.id)) return { ok: false, error: 'That entry could not be identified' };
  if (!str(p.reason).trim()) return { ok: false, error: 'A removal needs a reason' };

  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update({
      deleted_at: new Date().toISOString(),
      delete_reason: str(p.reason).trim(),
      updated_by: profile.id,
    })
    .eq('id', str(p.id));
  return error ? { ok: false, error: String(error.message ?? 'That entry could not be removed') } : { ok: true };
}
