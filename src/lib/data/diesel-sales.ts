import { createClient } from '@/lib/data/client';

/**
 * Every diesel sale a dispenser has recorded, newest first.
 *
 * One row per meter reading: the machine and nozzle it came off, the reading
 * itself, the taka on the display, and — once the manager has settled it —
 * whether it was cash or a party's due. The cash page reads this back as a
 * printable history; nothing here is entered or changed from this file.
 */

export interface DieselSaleRow {
  id: string;
  soldAt: string;
  machine: string;
  nozzleNo: number | null;
  reading: string;
  amount: string;
  settlement: 'pending' | 'cash' | 'credit';
  partyName: string | null;
  recordedBy: string | null;
  approvedBy: string | null;
}

function first<T>(v: unknown): T | null {
  return Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null);
}

export async function getDieselSales(): Promise<DieselSaleRow[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('meter_readings')
    .select(
      'id, created_at, reading, sale_amount, settlement, ' +
        'nozzles(nozzle_no, dispensers(code)), ' +
        'customers(name, name_bn), ' +
        'recorder:recorded_by(full_name), approver:approved_by(full_name)',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(2000);

  return ((data ?? []) as any[]).map((r) => {
    const nozzle = first<{ nozzle_no: number; dispensers: unknown }>(r.nozzles);
    const party = first<{ name: string; name_bn: string | null }>(r.customers);
    return {
      id: r.id,
      soldAt: r.created_at,
      machine: first<{ code: string }>(nozzle?.dispensers)?.code ?? '',
      nozzleNo: nozzle?.nozzle_no ?? null,
      reading: String(r.reading ?? '0'),
      amount: r.sale_amount === null || r.sale_amount === undefined ? '0' : String(r.sale_amount),
      settlement: (r.settlement ?? 'pending') as DieselSaleRow['settlement'],
      partyName: party ? (party.name_bn ?? party.name) : null,
      recordedBy: first<{ full_name: string }>(r.recorder)?.full_name ?? null,
      approvedBy: first<{ full_name: string }>(r.approver)?.full_name ?? null,
    };
  });
}
