'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Save } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { useRefreshKey } from '@/lib/refresh';
import { Button } from '@/components/jhm/button';
import { Chip, GlassCard, Muted } from '@/components/ui/glass';
import { getDailySheetLabels, saveDailySheetLabels, type Bilingual, type DailySheetLabels } from '@/lib/data/report-labels';

const INPUT = 'tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none';
const BORDER = { borderColor: 'var(--hairline)' } as const;

type SectionKey = 'title' | 'meters' | 'tanks' | 'sales' | 'credit' | 'lubricants' | 'expenses' | 'cash' | 'signatures';

const SECTION_KEYS: Array<{ key: SectionKey; en: string; bn: string }> = [
  { key: 'title', en: 'Sheet title', bn: 'বিবরণীর শিরোনাম' },
  { key: 'meters', en: 'Meter readings', bn: 'মিটার রিডিং' },
  { key: 'tanks', en: 'Tank stock', bn: 'ট্যাংক মজুদ' },
  { key: 'sales', en: 'Sales summary', bn: 'বিক্রয় সারসংক্ষেপ' },
  { key: 'credit', en: 'Credit sales', bn: 'বাকি বিক্রয়' },
  { key: 'lubricants', en: 'Lubricants', bn: 'লুব্রিকেন্ট' },
  { key: 'expenses', en: 'Expenses', bn: 'খরচ' },
  { key: 'cash', en: 'Cash account', bn: 'নগদ হিসাব' },
  { key: 'signatures', en: 'Signatures heading', bn: 'স্বাক্ষর শিরোনাম' },
];

/**
 * Report labels. The Daily Sheet's headings and five signature captions were
 * written without sight of the paper form, so the sheet used to nag every
 * reader until somebody confirmed them. Checking them is an admin's job and it
 * is done here, once: after the box is ticked the notice never returns to the
 * report.
 */
export function ReportLabelsCard() {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const refreshKey = useRefreshKey();
  const [labels, setLabels] = useState<DailySheetLabels | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getDailySheetLabels().then(setLabels);
  }, [refreshKey]);

  if (!labels) return null;

  const set = (key: SectionKey, side: 'en' | 'bn', value: string) =>
    setLabels((l) => (l ? { ...l, [key]: { ...l[key], [side]: value } } : l));
  const setLine = (index: number, side: 'en' | 'bn', value: string) =>
    setLabels((l) =>
      l ? { ...l, signature_lines: l.signature_lines.map((s, i) => (i === index ? { ...s, [side]: value } : s)) } : l,
    );

  async function save() {
    if (!labels) return;
    setBusy(true);
    setMessage(null);
    const res = await saveDailySheetLabels(labels);
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: bn ? 'সংরক্ষিত হয়েছে' : 'Saved' } : { ok: false, text: res.error ?? 'Could not save' });
  }

  const pair = (id: string, value: Bilingual, onEn: (v: string) => void, onBn: (v: string) => void, label: string) => (
    <div key={id} className="grid gap-2 sm:grid-cols-[10rem_1fr_1fr] sm:items-center">
      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
        {label}
      </span>
      <input value={value.en ?? ''} onChange={(e) => onEn(e.target.value)} className={INPUT} style={BORDER} aria-label={`${label} (English)`} />
      <input value={value.bn ?? ''} onChange={(e) => onBn(e.target.value)} className={INPUT} style={BORDER} aria-label={`${label} (বাংলা)`} lang="bn" />
    </div>
  );

  return (
    <GlassCard lift={false} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {bn ? 'রিপোর্টের লেবেল' : 'Report labels'}
        </h2>
        <Chip tone={labels.confirmed ? 'ok' : 'watch'} lang={lang}>
          {labels.confirmed ? (bn ? 'ছাপা ফর্মের সঙ্গে মিলানো' : 'Matches the paper form') : bn ? 'এখনো মেলানো হয়নি' : 'Not yet checked'}
        </Chip>
      </div>
      <Muted lang={lang}>
        {bn
          ? 'দৈনিক বিবরণীর শিরোনাম ও পাঁচটি স্বাক্ষরের ঘর ছাপা ফর্মের সঙ্গে মিলিয়ে নিন। মিলানো হয়ে গেলে রিপোর্টে আর কোনো সতর্কতা দেখা যাবে না।'
          : 'Check the daily sheet’s headings and its five signature captions against the printed form. Once confirmed, the notice no longer appears on the report.'}
      </Muted>

      <div className="space-y-2">
        {SECTION_KEYS.map((s) =>
          pair(
            s.key,
            labels[s.key],
            (v) => set(s.key, 'en', v),
            (v) => set(s.key, 'bn', v),
            bn ? s.bn : s.en,
          ),
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }} lang={lang}>
          {bn ? 'পাঁচটি স্বাক্ষরের ঘর' : 'The five signature lines'}
        </p>
        {labels.signature_lines.map((line, i) =>
          pair(`line-${i}`, line, (v) => setLine(i, 'en', v), (v) => setLine(i, 'bn', v), `${i + 1}`),
        )}
      </div>

      <label className="flex items-start gap-2 text-sm" lang={lang}>
        <input
          type="checkbox"
          checked={labels.confirmed}
          onChange={(e) => setLabels((l) => (l ? { ...l, confirmed: e.target.checked } : l))}
          className="mt-1 h-4 w-4"
        />
        <span>
          {bn
            ? 'আমি প্রতিটি শিরোনাম ও স্বাক্ষরের ঘর ছাপা ফর্মের সঙ্গে মিলিয়ে দেখেছি।'
            : 'I have checked every heading and signature caption against the printed form.'}
        </span>
      </label>

      <div className="flex items-center justify-end gap-3">
        {message ? (
          <span className={`flex items-center gap-1 text-sm ${message.ok ? 'state-ok' : 'state-breach'}`} role="status">
            {message.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : null}
            {message.text}
          </span>
        ) : null}
        <Button onClick={save} disabled={busy} lang={lang}>
          <Save className="h-4 w-4" aria-hidden />
          {bn ? 'সংরক্ষণ' : 'Save labels'}
        </Button>
      </div>
    </GlassCard>
  );
}
