import { createClient } from '@/lib/data/client';

export interface ShiftSheetRow {
  shiftId: string;
  shiftNo: number;
  shiftDate: string;
  shiftType: string;
  grossLitres: number;
  testLitres: number;
  netLitres: number;
  rate: number;
  amount: number;
  cash: number;
  credit: number;
  manager: string;
}

/** Closed shifts' litres-to-taka figures, numbered in order of trading, newest first. */
export async function getShiftSheet(): Promise<ShiftSheetRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('shift_sales')
    .select(
      'shift_id, gross_litres, test_litres, net_litres, rate_per_litre, sales_amount, cash_sales, credit_sales, ' +
        'shifts!inner(shift_date, shift_type, starts_at, status, closed_by)',
    );

  const list = ((data ?? []) as any[]).filter((r) => r.shift_id !== '00000000-0000-0000-0000-00000000a001');
  const ids = [...new Set(list.map((r) => (Array.isArray(r.shifts) ? r.shifts[0] : r.shifts)?.closed_by).filter(Boolean))];
  const { data: profs } = ids.length
    ? await supabase.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] as any[] };
  const names = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.full_name]));
  const rows = list
    .map((r) => {
      const s = Array.isArray(r.shifts) ? r.shifts[0] : r.shifts;
      return {
        startsAt: s?.starts_at ?? '',
        row: {
          shiftId: r.shift_id,
          shiftNo: 0,
          shiftDate: s?.shift_date ?? '',
          shiftType: s?.shift_type ?? '',
          grossLitres: Number(r.gross_litres) || 0,
          testLitres: Number(r.test_litres) || 0,
          netLitres: Number(r.net_litres) || 0,
          rate: Number(r.rate_per_litre) || 0,
          amount: Number(r.sales_amount) || 0,
          cash: Number(r.cash_sales) || 0,
          credit: Number(r.credit_sales) || 0,
          manager: names.get(s?.closed_by) ?? '—',
        } as ShiftSheetRow,
      };
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  rows.forEach((r, i) => (r.row.shiftNo = i + 1));
  return rows.map((r) => r.row).reverse();
}
