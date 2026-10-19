import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';
import { signalRefresh } from '@/lib/refresh';

const KEY = 'truck_capacities';

/** Truck capacity options (litres) offered in the oil purchase dropdown. */
export async function getTruckCapacities(): Promise<number[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('value').eq('key', KEY).maybeSingle();
  const list = Array.isArray(data?.value?.value) ? (data.value.value as unknown[]) : [];
  const nums = list.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return nums.length ? [...new Set(nums)].sort((a, b) => a - b) : [18000];
}

export async function saveTruckCapacities(list: number[]): Promise<{ ok: boolean; error?: string }> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') return { ok: false, error: 'Only an admin may change this list' };
  const clean = [...new Set(list.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  if (!clean.length) return { ok: false, error: 'Keep at least one capacity' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('settings')
    .update({ value: { value: clean }, updated_by: profile.id })
    .eq('key', KEY);
  if (error) return { ok: false, error: error.message };
  signalRefresh();
  return { ok: true };
}
