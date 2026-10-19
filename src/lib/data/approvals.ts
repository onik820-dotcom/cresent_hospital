import { createClient } from '@/lib/data/client';

/**
 * Everything waiting for a manager's word: the sales a dispenser submitted
 * (each one has to become either cash or a party's due), and the dips and
 * tanker deliveries that need the manager's name against them before they
 * count as checked.
 */

export interface PendingSale {
  id: string;
  recordedAt: string;
  machine: string;
  nozzleNo: number | null;
  reading: string;
  amount: string | null;
  readingType: string;
  recordedBy: string | null;
}

export interface PendingDip {
  id: string;
  recordedAt: string;
  tankCode: string;
  dipType: string;
  dipMm: string;
  litres: string;
  recordedBy: string | null;
}

export interface PendingDelivery {
  id: string;
  arrivedAt: string;
  challanNo: string | null;
  truckReg: string | null;
  totalReceived: string;
}

export interface PendingWork {
  sales: PendingSale[];
  dips: PendingDip[];
  deliveries: PendingDelivery[];
}

function first<T>(v: unknown): T | null {
  return Array.isArray(v) ? ((v[0] as T) ?? null) : ((v as T) ?? null);
}

export async function getPendingWork(): Promise<PendingWork> {
  const supabase = await createClient();

  const [{ data: sales }, { data: dips }, { data: deliveries }] = await Promise.all([
    supabase
      .from('meter_readings')
      .select(
        'id, created_at, reading, sale_amount, reading_type, ' +
          'nozzles(nozzle_no, dispensers(code)), profiles:recorded_by(full_name)',
      )
      .eq('settlement', 'pending')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('tank_dips')
      .select('id, recorded_at, dip_type, dip_mm, litres, tanks(code), profiles:recorded_by(full_name)')
      .is('approved_at', null)
      .is('deleted_at', null)
      .order('recorded_at', { ascending: false })
      .limit(50),
    supabase
      .from('tanker_deliveries')
      .select('id, arrived_at, challan_no, truck_reg, total_received')
      .is('approved_at', null)
      .is('deleted_at', null)
      .order('arrived_at', { ascending: false })
      .limit(50),
  ]);

  return {
    sales: ((sales ?? []) as any[]).map((r) => {
      const nozzle = first<{ nozzle_no: number; dispensers: unknown }>(r.nozzles);
      return {
        id: r.id,
        recordedAt: r.created_at,
        machine: first<{ code: string }>(nozzle?.dispensers)?.code ?? '',
        nozzleNo: nozzle?.nozzle_no ?? null,
        reading: String(r.reading ?? ''),
        amount: r.sale_amount === null || r.sale_amount === undefined ? null : String(r.sale_amount),
        readingType: r.reading_type,
        recordedBy: first<{ full_name: string }>(r.profiles)?.full_name ?? null,
      };
    }),
    dips: ((dips ?? []) as any[]).map((r) => ({
      id: r.id,
      recordedAt: r.recorded_at,
      tankCode: first<{ code: string }>(r.tanks)?.code ?? '',
      dipType: r.dip_type,
      dipMm: String(r.dip_mm ?? ''),
      litres: String(r.litres ?? ''),
      recordedBy: first<{ full_name: string }>(r.profiles)?.full_name ?? null,
    })),
    deliveries: ((deliveries ?? []) as any[]).map((r) => ({
      id: r.id,
      arrivedAt: r.arrived_at,
      challanNo: r.challan_no,
      truckReg: r.truck_reg,
      totalReceived: String(r.total_received ?? '0'),
    })),
  };
}

/**
 * What the owner and the MD watch: the work after the manager has said yes.
 * Sales that have been marked cash or put on a party's account, dips and
 * tanker refills the manager has signed off, and lubricant sales as they
 * happen. Nothing here is actionable — it is the live record.
 */

export interface SettledSale {
  id: string;
  at: string;
  machine: string;
  nozzleNo: number | null;
  reading: string;
  amount: string | null;
  settlement: string;
  partyName: string | null;
  approvedBy: string | null;
}

export interface ApprovedDip {
  id: string;
  at: string;
  tankCode: string;
  dipType: string;
  dipMm: string;
  litres: string;
  approvedBy: string | null;
}

export interface ApprovedDelivery {
  id: string;
  at: string;
  challanNo: string | null;
  truckReg: string | null;
  totalReceived: string;
  approvedBy: string | null;
}

export interface LubSale {
  id: string;
  at: string;
  skuName: string;
  unit: string;
  qty: string;
  rate: string;
  amount: string;
  partyName: string | null;
  recordedBy: string | null;
}

export interface ApprovedFeed {
  sales: SettledSale[];
  dips: ApprovedDip[];
  deliveries: ApprovedDelivery[];
  lubSales: LubSale[];
}

export async function getApprovedFeed(limit = 12): Promise<ApprovedFeed> {
  const supabase = await createClient();

  const [{ data: sales }, { data: dips }, { data: deliveries }, { data: lubs }] = await Promise.all([
    supabase
      .from('meter_readings')
      .select(
        'id, created_at, approved_at, reading, sale_amount, settlement, ' +
          'nozzles(nozzle_no, dispensers(code)), customers(name, name_bn), approver:approved_by(full_name)',
      )
      .neq('settlement', 'pending')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('tank_dips')
      .select('id, recorded_at, approved_at, dip_type, dip_mm, litres, tanks(code), approver:approved_by(full_name)')
      .not('approved_at', 'is', null)
      .is('deleted_at', null)
      .order('approved_at', { ascending: false })
      .limit(limit),
    supabase
      .from('tanker_deliveries')
      .select('id, arrived_at, approved_at, challan_no, truck_reg, total_received, approver:approved_by(full_name)')
      .not('approved_at', 'is', null)
      .is('deleted_at', null)
      .order('approved_at', { ascending: false })
      .limit(limit),
    supabase
      .from('lub_transactions')
      .select(
        'id, txn_at, qty, rate, amount, lub_skus(name, name_bn, unit), customers(name, name_bn), ' +
          'recorder:created_by(full_name)',
      )
      .eq('txn_type', 'sale')
      .is('deleted_at', null)
      .order('txn_at', { ascending: false })
      .limit(limit),
  ]);

  const partyName = (v: unknown) => {
    const c = first<{ name: string; name_bn: string | null }>(v);
    return c ? (c.name_bn || c.name) : null;
  };

  return {
    sales: ((sales ?? []) as any[]).map((r) => {
      const nozzle = first<{ nozzle_no: number; dispensers: unknown }>(r.nozzles);
      return {
        id: r.id,
        at: r.approved_at ?? r.created_at,
        machine: first<{ code: string }>(nozzle?.dispensers)?.code ?? '',
        nozzleNo: nozzle?.nozzle_no ?? null,
        reading: String(r.reading ?? ''),
        amount: r.sale_amount === null || r.sale_amount === undefined ? null : String(r.sale_amount),
        settlement: r.settlement,
        partyName: partyName(r.customers),
        approvedBy: first<{ full_name: string }>(r.approver)?.full_name ?? null,
      };
    }),
    dips: ((dips ?? []) as any[]).map((r) => ({
      id: r.id,
      at: r.approved_at ?? r.recorded_at,
      tankCode: first<{ code: string }>(r.tanks)?.code ?? '',
      dipType: r.dip_type,
      dipMm: String(r.dip_mm ?? ''),
      litres: String(r.litres ?? ''),
      approvedBy: first<{ full_name: string }>(r.approver)?.full_name ?? null,
    })),
    deliveries: ((deliveries ?? []) as any[]).map((r) => ({
      id: r.id,
      at: r.approved_at ?? r.arrived_at,
      challanNo: r.challan_no,
      truckReg: r.truck_reg,
      totalReceived: String(r.total_received ?? '0'),
      approvedBy: first<{ full_name: string }>(r.approver)?.full_name ?? null,
    })),
    lubSales: ((lubs ?? []) as any[]).map((r) => {
      const sku = first<{ name: string; name_bn: string | null; unit?: string }>(r.lub_skus);
      return {
        id: r.id,
        at: r.txn_at,
        skuName: sku ? (sku.name_bn || sku.name) : '',
        unit: sku?.unit ?? 'litre',
        qty: String(r.qty ?? '0'),
        rate: String(r.rate ?? '0'),
        amount: String(r.amount ?? '0'),
        partyName: partyName(r.customers),
        recordedBy: first<{ full_name: string }>(r.recorder)?.full_name ?? null,
      };
    }),
  };
}
