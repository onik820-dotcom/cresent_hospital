import { supabase } from "@/integrations/supabase/client";

/**
 * The ported data and action modules were written against PostgREST's raw
 * JSON, where numeric columns arrive as strings and decimal.js does the
 * maths. The generated Database types model numerics as `number`, which
 * fights that style everywhere, so the client is intentionally untyped here.
 * Row-level security is unchanged — it is enforced by the database.
 */
export function createClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}
