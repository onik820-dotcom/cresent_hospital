import { createClient } from '@/lib/data/client';

/**
 * Exact purchased oil left: litres bought on Oil purchase minus litres moved into
 * station tanks (dip refill + sold during refill). No mm/chart rounding.
 * Same figure the dashboard stock and the assistant use (purchased_oil_litres()).
 */
export async function getPurchasedOilLitres(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('purchased_oil_litres');
  return Math.round((Number(data) || 0) * 1000) / 1000;
}
