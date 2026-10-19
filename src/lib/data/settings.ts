import { createClient } from '@/lib/data/client';

/**
 * The lists every dropdown in the app reads from: party names, lubricant
 * products, and how each product is measured. Kept in one place so a name
 * typed once appears the same way on every screen.
 */

export interface PartyOption {
  id: string;
  name: string;
  nameBn: string | null;
  type: string;
  isActive: boolean;
}

export interface SkuOption {
  id: string;
  name: string;
  nameBn: string | null;
  brand: string | null;
  packType: string;
  packSizeLitres: string | null;
  unit: string;
  saleRate: string;
  isActive: boolean;
}

export interface SettingsOptions {
  parties: PartyOption[];
  skus: SkuOption[];
}

export async function getSettingsOptions(): Promise<SettingsOptions> {
  const supabase = await createClient();

  const [{ data: parties }, { data: skus }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, name_bn, type, is_active')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('lub_skus')
      .select('id, name, name_bn, brand, pack_type, pack_size_litres, unit, current_sale_rate, is_active')
      .is('deleted_at', null)
      .order('name'),
  ]);

  return {
    parties: ((parties ?? []) as Array<Record<string, unknown>>).map((p) => ({
      id: String(p.id),
      name: String(p.name),
      nameBn: (p.name_bn as string | null) ?? null,
      type: String(p.type),
      isActive: Boolean(p.is_active),
    })),
    skus: ((skus ?? []) as Array<Record<string, unknown>>).map((s) => ({
      id: String(s.id),
      name: String(s.name),
      nameBn: (s.name_bn as string | null) ?? null,
      brand: (s.brand as string | null) ?? null,
      packType: String(s.pack_type),
      packSizeLitres: s.pack_size_litres === null || s.pack_size_litres === undefined ? null : String(s.pack_size_litres),
      unit: String(s.unit ?? 'litre'),
      saleRate: String(s.current_sale_rate ?? '0'),
      isActive: Boolean(s.is_active),
    })),
  };
}
