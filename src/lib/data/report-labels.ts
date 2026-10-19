import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';
import { signalRefresh } from '@/lib/refresh';

/**
 * The Daily Sheet's headings and five signature captions, stored in
 * settings.daily_sheet_labels (seeded by migration 0024). The database function
 * daily_sheet() reads the same row, so a change here reaches the printed sheet.
 */
export interface Bilingual {
  en?: string;
  bn?: string;
}

export interface DailySheetLabels {
  title: Bilingual;
  meters: Bilingual;
  tanks: Bilingual;
  sales: Bilingual;
  credit: Bilingual;
  lubricants: Bilingual;
  expenses: Bilingual;
  cash: Bilingual;
  signatures: Bilingual;
  signature_lines: Bilingual[];
  confirmed: boolean;
}

const KEY = 'daily_sheet_labels';
const SECTION_KEYS = ['title', 'meters', 'tanks', 'sales', 'credit', 'lubricants', 'expenses', 'cash', 'signatures'] as const;

function normalise(raw: unknown): DailySheetLabels {
  const r = (raw ?? {}) as Record<string, unknown>;
  const bi = (v: unknown): Bilingual => ({
    en: String((v as Bilingual | undefined)?.en ?? ''),
    bn: String((v as Bilingual | undefined)?.bn ?? ''),
  });
  const lines = Array.isArray(r.signature_lines) ? (r.signature_lines as unknown[]).map(bi) : [];
  while (lines.length < 5) lines.push({ en: '', bn: '' });
  return {
    title: bi(r.title),
    meters: bi(r.meters),
    tanks: bi(r.tanks),
    sales: bi(r.sales),
    credit: bi(r.credit),
    lubricants: bi(r.lubricants),
    expenses: bi(r.expenses),
    cash: bi(r.cash),
    signatures: bi(r.signatures),
    signature_lines: lines.slice(0, 5),
    confirmed: r.confirmed === true,
  };
}

export async function getDailySheetLabels(): Promise<DailySheetLabels> {
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('value').eq('key', KEY).maybeSingle();
  return normalise(data?.value);
}

export async function saveDailySheetLabels(labels: DailySheetLabels): Promise<{ ok: boolean; error?: string }> {
  const profile = await getSessionProfile();
  if (profile?.role !== 'admin') return { ok: false, error: 'Only an admin may change this' };
  for (const key of SECTION_KEYS) {
    if (!(labels[key].en ?? '').trim() && !(labels[key].bn ?? '').trim()) {
      return { ok: false, error: `Give "${key}" a name in at least one language` };
    }
  }
  if (labels.signature_lines.some((l) => !(l.en ?? '').trim() && !(l.bn ?? '').trim())) {
    return { ok: false, error: 'All five signature lines need a caption' };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('settings')
    .update({ value: labels, updated_by: profile.id })
    .eq('key', KEY);
  if (error) return { ok: false, error: error.message };
  signalRefresh();
  return { ok: true };
}
