import { useEffect, useState } from 'react';
import { createClient } from '@/lib/data/client';
import { useRole } from '@/lib/use-can-edit';

/**
 * Reading the audit log, turned into sentences a person can follow.
 *
 * audit_log is append-only and written by trigger, so what is shown here is
 * what happened — not what the screen remembers. Only the admin and the MD may
 * read it (RLS), which is why callers ask useRole() before showing any of this.
 */

/** Bookkeeping columns that change on every write and say nothing to a reader. */
const NOISE = new Set(['updated_at', 'updated_by', 'created_at', 'created_by', 'calculated_at', 'recalculated_by', 'approved_at', 'approved_by']);

/** Tables whose rows are worked out from others rather than entered. */
export const DERIVED_TABLES = new Set(['shifts', 'shift_sales', 'shift_stock', 'cash_reconciliation', 'shift_summary']);

export const TABLE_LABEL: Record<string, { en: string; bn: string }> = {
  expenses: { en: 'Expense', bn: 'খরচ' },
  credit_sales: { en: 'Credit sale', bn: 'বাকি বিক্রি' },
  payments: { en: 'Due collection', bn: 'বাকি আদায়' },
  bank_transactions: { en: 'Bank line', bn: 'ব্যাংক লাইন' },
  lub_transactions: { en: 'Lubricant', bn: 'লুব্রিকেন্ট' },
  meter_readings: { en: 'Meter reading', bn: 'মিটার রিডিং' },
  tank_dips: { en: 'Tank dip', bn: 'ট্যাংক ডিপ' },
  tanker_deliveries: { en: 'Tank refill', bn: 'ট্যাংক রিফিল' },
  tanker_compartments: { en: 'Tank refill', bn: 'ট্যাংক রিফিল' },
  shift_sales: { en: 'Shift sales', bn: 'শিফটের বিক্রি' },
  shift_stock: { en: 'Tank stock', bn: 'ট্যাংক মজুদ' },
  cash_reconciliation: { en: 'Cash count', bn: 'নগদ হিসাব' },
  shifts: { en: 'Shift', bn: 'শিফট' },
};

export interface AuditChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  table: string;
  recordId: string | null;
  action: 'insert' | 'update' | 'delete';
  /** 'deleted' is a soft delete: deleted_at going from empty to set. */
  kind: 'added' | 'edited' | 'deleted' | 'removed';
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  reason: string | null;
  derived: boolean;
  changes: AuditChange[];
}

type Json = Record<string, unknown> | null;

const show = (v: unknown): string | null => (v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** The fields that differ between two versions of a row, noise removed. */
export function diffRows(before: Json, after: Json): AuditChange[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: AuditChange[] = [];
  for (const key of keys) {
    if (NOISE.has(key)) continue;
    const b = show(before?.[key]);
    const a = show(after?.[key]);
    if (b !== a) out.push({ field: key, before: b, after: a });
  }
  return out;
}

interface RawAudit {
  id: number;
  table_name: string;
  record_id: string | null;
  action: 'insert' | 'update' | 'delete';
  before: Json;
  after: Json;
  actor_id: string | null;
  actor_role: string | null;
  reason: string | null;
  created_at: string;
}

async function withActors(raw: RawAudit[]): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const ids = [...new Set(raw.map((r) => r.actor_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids);
    for (const p of (data ?? []) as Array<{ id: string; full_name: string }>) names.set(p.id, p.full_name);
  }
  return raw.map((r) => {
    const softDeleted = r.action === 'update' && !r.before?.deleted_at && !!r.after?.deleted_at;
    const kind: AuditEntry['kind'] = r.action === 'insert' ? 'added' : r.action === 'delete' ? 'removed' : softDeleted ? 'deleted' : 'edited';
    const changes = r.action === 'insert' ? diffRows(null, r.after) : diffRows(r.before, r.after);
    return {
      id: r.id,
      at: r.created_at,
      table: r.table_name,
      recordId: r.record_id,
      action: r.action,
      kind,
      actorId: r.actor_id,
      actorName: r.actor_id ? (names.get(r.actor_id) ?? '—') : 'system',
      actorRole: r.actor_role,
      reason: r.reason ?? (softDeleted ? ((r.after?.delete_reason as string | undefined) ?? null) : null),
      derived: DERIVED_TABLES.has(r.table_name),
      changes,
    };
  });
}

/** Everything written against one shift, newest first. */
export async function getShiftAudit(shiftId: string): Promise<AuditEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, table_name, record_id, action, before, after, actor_id, actor_role, reason, created_at')
    .or(`after->>shift_id.eq.${shiftId},before->>shift_id.eq.${shiftId},and(table_name.eq.shifts,record_id.eq.${shiftId})`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);
  const entries = await withActors((data ?? []) as RawAudit[]);
  // An update that changed nothing but bookkeeping columns is not news.
  return entries.filter((e) => e.kind !== 'edited' || e.changes.length > 0);
}

export interface Editor {
  name: string;
  at: string;
}

/**
 * Who last changed each of these records after it was first saved — for the
 * pencil badge on report lines. Reads the audit log, so it quietly returns
 * nothing for any role that may not (and for the admin and MD, one query).
 */
export function useEditors(table: string, ids: string[]): Map<string, Editor> {
  const role = useRole();
  const [editors, setEditors] = useState<Map<string, Editor>>(new Map());
  const key = ids.join(',');

  useEffect(() => {
    if ((role !== 'admin' && role !== 'md') || ids.length === 0) {
      setEditors(new Map());
      return;
    }
    let alive = true;
    (async () => {
      const supabase = await createClient();
      const { data } = await supabase
        .from('audit_log')
        .select('id, table_name, record_id, action, before, after, actor_id, actor_role, reason, created_at')
        .eq('table_name', table)
        .eq('action', 'update')
        .eq('actor_role', 'admin')
        .in('record_id', ids)
        .order('created_at', { ascending: false })
        .limit(500);
      const entries = (await withActors((data ?? []) as RawAudit[])).filter((e) => e.kind === 'edited' && e.changes.length > 0);
      const map = new Map<string, Editor>();
      for (const e of entries) if (e.recordId && !map.has(e.recordId)) map.set(e.recordId, { name: e.actorName, at: e.at });
      if (alive) setEditors(map);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, table, key]);

  return editors;
}
