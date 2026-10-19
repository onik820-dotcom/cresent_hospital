import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';
import { litresStr, moneyStr } from '@/lib/calc/decimal';
import { signalRefresh } from '@/lib/refresh';

export interface SettingsResult {
  ok: boolean;
  error?: string;
}

async function requireAdmin() {
  const profile = await getSessionProfile();
  return profile?.role === 'admin' ? profile : null;
}

export interface PartyNameInput {
  id?: string;
  name: string;
  name_bn?: string;
  type: 'company' | 'individual' | 'govt';
  is_active: boolean;
}

/**
 * A party name, and nothing else. Balances, limits and ageing belong to the
 * dues page; this list only decides what the dropdowns offer.
 */
export async function savePartyName(input: PartyNameInput): Promise<SettingsResult> {
  const profile = await requireAdmin();
  if (!profile) return { ok: false, error: 'Only an admin may change this list' };
  if (!input.name.trim()) return { ok: false, error: 'A party needs a name' };

  const supabase = await createClient();
  const row = {
    name: input.name.trim(),
    name_bn: input.name_bn?.trim() || null,
    type: input.type,
    is_active: input.is_active,
  };

  if (input.id) {
    const { error } = await supabase
      .from('customers')
      .update({ ...row, updated_by: profile.id })
      .eq('id', input.id);
    if (error) return { ok: false, error: String(error.message ?? 'That party could not be saved') };
  } else {
    const { data: station } = await supabase.from('stations').select('id').limit(1).maybeSingle();
    const { error } = await supabase
      .from('customers')
      .insert({ ...row, station_id: station?.id ?? null, created_by: profile.id });
    if (error) return { ok: false, error: String(error.message ?? 'That party could not be created') };
  }

  signalRefresh();
  return { ok: true };
}

export interface SkuInput {
  id?: string;
  name: string;
  name_bn?: string;
  brand?: string;
  pack_type: 'loose' | 'can' | 'drum' | 'grease';
  pack_size: string;
  /** How the product is measured everywhere it appears: by litre, or by kg. */
  unit: 'litre' | 'kg' | 'pcs';
  sale_rate: string;
  is_active: boolean;
}

export async function saveSku(input: SkuInput): Promise<SettingsResult> {
  const profile = await requireAdmin();
  if (!profile) return { ok: false, error: 'Only an admin may change this list' };
  if (!input.name.trim()) return { ok: false, error: 'A lubricant needs a name' };

  const supabase = await createClient();
  const row = {
    name: input.name.trim(),
    name_bn: input.name_bn?.trim() || null,
    brand: input.brand?.trim() || null,
    pack_type: input.pack_type,
    pack_size_litres: input.pack_size.trim() ? litresStr(input.pack_size) : null,
    unit: input.unit,
    current_sale_rate: moneyStr(input.sale_rate || '0'),
    is_active: input.is_active,
  };

  if (input.id) {
    const { error } = await supabase
      .from('lub_skus')
      .update({ ...row, updated_by: profile.id })
      .eq('id', input.id);
    if (error) return { ok: false, error: String(error.message ?? 'That lubricant could not be saved') };
  } else {
    const { data: station } = await supabase.from('stations').select('id').limit(1).maybeSingle();
    const { error } = await supabase.from('lub_skus').insert({
      ...row,
      station_id: station?.id ?? null,
      current_purchase_rate: 0,
      reorder_level: 0,
      created_by: profile.id,
    });
    if (error) return { ok: false, error: String(error.message ?? 'That lubricant could not be created') };
  }

  signalRefresh();
  return { ok: true };
}

/**
 * Removing a name never destroys it: sales and dues already booked under that
 * party or product must keep reading. The row is marked deleted with the
 * owner's reason, so it vanishes from every dropdown while its history stays
 * whole on the reports.
 */
export async function deletePartyName(id: string, reason: string): Promise<SettingsResult> {
  const profile = await requireAdmin();
  if (!profile) return { ok: false, error: 'Only an admin may change this list' };
  if (!reason.trim()) return { ok: false, error: 'A short reason is needed' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('customers')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: profile.id,
      delete_reason: reason.trim(),
      is_active: false,
      updated_by: profile.id,
    })
    .eq('id', id);
  if (error) return { ok: false, error: String(error.message ?? 'That party could not be removed') };

  signalRefresh();
  return { ok: true };
}

export async function deleteSku(id: string, reason: string): Promise<SettingsResult> {
  const profile = await requireAdmin();
  if (!profile) return { ok: false, error: 'Only an admin may change this list' };
  if (!reason.trim()) return { ok: false, error: 'A short reason is needed' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('lub_skus')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: profile.id,
      delete_reason: reason.trim(),
      is_active: false,
      updated_by: profile.id,
    })
    .eq('id', id);
  if (error) return { ok: false, error: String(error.message ?? 'That lubricant could not be removed') };

  signalRefresh();
  return { ok: true };
}
