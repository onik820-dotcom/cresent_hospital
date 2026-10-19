import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';
import { signalRefresh } from '@/lib/refresh';

/** Trucks live on the truck_capacities settings row, next to the plain capacity list. */
const KEY = 'truck_capacities';

export interface TruckInfo {
  id: string;
  name: string;
  reg: string;
  driver: string;
  capacity: number;
}

export const truckLabel = (t: TruckInfo) =>
  [t.name, t.reg].filter(Boolean).join(' — ') + ` (${t.capacity.toLocaleString('en-IN')} L)`;

export async function getTrucks(): Promise<TruckInfo[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('value').eq('key', KEY).maybeSingle();
  const list = Array.isArray((data?.value as any)?.trucks) ? ((data!.value as any).trucks as any[]) : [];
  return list
    .map((t) => ({
      id: String(t.id ?? crypto.randomUUID()),
      name: String(t.name ?? '').trim(),
      reg: String(t.reg ?? '').trim(),
      driver: String(t.driver ?? '').trim(),
      capacity: Number(t.capacity) || 0,
    }))
    .filter((t) => (t.name || t.reg) && t.capacity > 0)
    .sort((a, b) => a.name.localeCompare(b.name) || a.reg.localeCompare(b.reg));
}

export async function saveTrucks(list: TruckInfo[]): Promise<{ ok: boolean; error?: string }> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') return { ok: false, error: 'Only an admin may change this list' };
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('value').eq('key', KEY).maybeSingle();
  const oldCaps = Array.isArray((data?.value as any)?.value) ? ((data!.value as any).value as number[]) : [18000];
  const caps = [...new Set([...list.map((t) => t.capacity), ...(list.length ? [] : oldCaps)])]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const { error } = await supabase
    .from('settings')
    .update({ value: { value: caps.length ? caps : [18000], trucks: list } as any, updated_by: profile.id })
    .eq('key', KEY);
  if (error) return { ok: false, error: error.message };
  signalRefresh();
  return { ok: true };
}
