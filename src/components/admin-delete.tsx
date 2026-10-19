'use client';

import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionProfile } from '@/lib/session';
import { signalRefresh } from '@/lib/refresh';
import { useLang } from '@/lib/i18n/provider';

export type DeletableTable =
  | 'expenses'
  | 'payments'
  | 'credit_sales'
  | 'lub_transactions'
  | 'tank_dips'
  | 'meter_readings'
  | 'tanker_deliveries'
  | 'bank_transactions'
  | 'purchase_orders';

let adminCache: Promise<boolean> | null = null;
function useIsAdmin() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    adminCache ??= getSessionProfile().then((p) => p?.role === 'admin');
    adminCache.then(setAdmin);
  }, []);
  return admin;
}

/** Trash button shown only to the Owner/Admin; deletes one saved record. */
export function AdminDelete({ table, id, onDone }: { table: DeletableTable; id: string; onDone?: () => void }) {
  const isAdmin = useIsAdmin();
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [busy, setBusy] = useState(false);
  if (!isAdmin || !id) return null;

  async function run(e: React.MouseEvent) {
    e.stopPropagation();
    const reason = window.prompt(bn ? 'মুছে ফেলার কারণ লিখুন' : 'Why delete this record?');
    if (reason === null) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_void_record', { p_table: table, p_id: id, p_reason: reason });
    setBusy(false);
    if (error) return window.alert(error.message);
    signalRefresh();
    onDone?.();
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      aria-label={bn ? 'মুছুন' : 'Delete'}
      title={bn ? 'মুছুন' : 'Delete'}
      className="no-print inline-flex rounded-md p-1 align-middle disabled:opacity-40"
      style={{ color: 'var(--color-breach)' }}
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
