'use client';

import { useEffect, useState } from 'react';
import { Gauge, Save } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { useRefreshKey } from '@/lib/refresh';
import { Button } from '@/components/jhm/button';
import { GlassCard, Muted } from '@/components/ui/glass';
import {
  DEFAULT_THRESHOLDS,
  THRESHOLD_LIMITS,
  getThresholds,
  saveThresholds,
  type Thresholds,
} from '@/lib/data/thresholds';

const INPUT = 'tap-target tabular w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none';
const BORDER = { borderColor: 'var(--hairline)' } as const;

interface FieldSpec {
  key: keyof Thresholds;
  en: string;
  bn: string;
  hintEn: string;
  hintBn: string;
}

/** The numbers behind the red / yellow / green and the "reason required" rules. */
const THRESHOLD_FIELDS: FieldSpec[] = [
  {
    key: 'stockVarianceAlertPct',
    en: 'Stock variance alert (%)',
    bn: 'স্টক গরমিল সতর্কতা (%)',
    hintEn: 'Past this share of litres sold: red, a written reason is required, an alert is raised.',
    hintBn: 'বিক্রির এই শতাংশের বেশি হলে লাল; কারণ লিখতে হবে।',
  },
  {
    key: 'stockVarianceWarnPct',
    en: 'Stock variance warning (%)',
    bn: 'স্টক গরমিল সাবধানতা (%)',
    hintEn: 'From here up to the alert level shows yellow. Below it is green.',
    hintBn: 'এখান থেকে সতর্কতার স্তর পর্যন্ত হলুদ; এর নিচে সবুজ।',
  },
  {
    key: 'varianceFloorLitres',
    en: 'Ignore stock gaps up to (L)',
    bn: 'এই লিটার পর্যন্ত গরমিল ধরা হবে না',
    hintEn: 'A gap this small is never flagged, whatever its percentage.',
    hintBn: 'এর চেয়ে ছোট গরমিল কখনো লাল হয় না।',
  },
  {
    key: 'cashVarianceTolerance',
    en: 'Cash variance alert (৳)',
    bn: 'নগদ গরমিল সতর্কতা (৳)',
    hintEn: 'A cash difference up to this is a clean close. Zero means any difference needs a reason.',
    hintBn: 'এই টাকা পর্যন্ত গরমিল ঠিক ধরা হবে। ০ হলে যেকোনো গরমিলে কারণ লিখতে হবে।',
  },
  {
    key: 'maxCreditLimitDefault',
    en: 'Default customer credit limit (৳)',
    bn: 'পার্টির ডিফল্ট বাকির সীমা (৳)',
    hintEn: 'Suggested when a new credit party is added. Each party can still be set separately.',
    hintBn: 'নতুন পার্টি যোগ করার সময় এটি বসবে; প্রতিটি পার্টির জন্য আলাদা করা যায়।',
  },
  {
    key: 'avcoRoundingDecimals',
    en: 'AVCO cost rounding (decimal places)',
    bn: 'গড় খরচ রাউন্ডিং (দশমিক ঘর)',
    hintEn: 'Decimal places carried on the average cost per litre. 2 to 6.',
    hintBn: 'প্রতি লিটার গড় খরচে কত দশমিক ঘর থাকবে। ২ থেকে ৬।',
  },
];

const SHIFT_DEFAULT_FIELDS: FieldSpec[] = [
  {
    key: 'testFireLitresDefault',
    en: 'Default test fire per nozzle (L)',
    bn: 'প্রতি নজলে ডিফল্ট টেস্ট (লি.)',
    hintEn: 'Pre-filled when a shift is closed — unless the last five shifts all used the same quantity, which is offered instead. The manager confirms or changes it.',
    hintBn: 'শিফট বন্ধ করার সময় বসানো থাকবে; ম্যানেজার নিশ্চিত করেন বা বদলান।',
  },
];

/**
 * Admin-only. Saves into the same `settings` rows the database reads, so the
 * numbers shown on every screen and the numbers the database enforces at
 * sign-off are one and the same.
 */
function ThresholdForm({
  title,
  titleBn,
  intro,
  introBn,
  fields,
  footnote,
}: {
  title: string;
  titleBn: string;
  intro: string;
  introBn: string;
  fields: FieldSpec[];
  footnote?: { en: string; bn: string };
}) {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const refreshKey = useRefreshKey();
  const [saved, setSaved] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [text, setText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getThresholds().then((t) => {
      setSaved(t);
      setText(Object.fromEntries(fields.map((f) => [f.key, String(t[f.key])])));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  async function save() {
    setBusy(true);
    setMessage(null);
    const next = { ...saved };
    for (const f of fields) {
      const n = Number((text[f.key] ?? '').replace(/,/g, '').trim());
      if (!Number.isFinite(n) || (text[f.key] ?? '').trim() === '') {
        setBusy(false);
        return setMessage({ ok: false, text: `${bn ? f.bn : f.en}: ${bn ? 'একটি সংখ্যা দিন' : 'enter a number'}` });
      }
      next[f.key] = n;
    }
    const res = await saveThresholds(next);
    setBusy(false);
    if (res.ok) {
      setSaved(next);
      setMessage({ ok: true, text: bn ? 'সংরক্ষিত হয়েছে' : 'Saved' });
    } else {
      setMessage({ ok: false, text: res.error ?? 'Could not save' });
    }
  }

  return (
    <GlassCard lift={false} className="space-y-3">
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
          {bn ? titleBn : title}
        </h2>
      </div>
      <Muted lang={lang}>{bn ? introBn : intro}</Muted>

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const { min, max } = THRESHOLD_LIMITS[f.key];
          return (
            <label key={f.key} className="block space-y-1">
              <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
                {bn ? f.bn : f.en}
              </span>
              <input
                value={text[f.key] ?? ''}
                inputMode="decimal"
                onChange={(e) => setText((v) => ({ ...v, [f.key]: e.target.value }))}
                className={INPUT}
                style={BORDER}
                aria-describedby={`${f.key}-hint`}
              />
              <Muted id={`${f.key}-hint`} lang={lang}>
                {bn ? f.hintBn : f.hintEn} ({min}–{max})
              </Muted>
            </label>
          );
        })}
      </div>

      {footnote ? <Muted lang={lang}>{bn ? footnote.bn : footnote.en}</Muted> : null}

      <div className="flex items-center justify-end gap-3">
        {message ? (
          <span className={`text-sm ${message.ok ? 'state-ok' : 'state-breach'}`} role="status">
            {message.text}
          </span>
        ) : null}
        <Button onClick={save} disabled={busy} lang={lang}>
          <Save className="h-4 w-4" aria-hidden />
          {bn ? 'সংরক্ষণ' : 'Save'}
        </Button>
      </div>
    </GlassCard>
  );
}

export function ThresholdsCard() {
  return (
    <ThresholdForm
      title="Calculation thresholds"
      titleBn="হিসাবের সীমা"
      intro="The limits that decide red, yellow and green, and when a reason is demanded. The same numbers are used by the database at sign-off, so changing them here changes the rule everywhere."
      introBn="কোনটি লাল, হলুদ বা সবুজ হবে এবং কখন কারণ লিখতে হবে তার সীমা। সাইন-অফের সময় ডাটাবেসও এই সংখ্যাই ব্যবহার করে।"
      fields={THRESHOLD_FIELDS}
      footnote={{
        en: 'Changes apply to shifts closed from now on. Shifts already closed keep the verdict they were signed with.',
        bn: 'পরিবর্তন এখন থেকে বন্ধ হওয়া শিফটে প্রযোজ্য। আগের বন্ধ শিফটের সিদ্ধান্ত বদলায় না।',
      }}
    />
  );
}

export function ShiftDefaultsCard() {
  return (
    <ThresholdForm
      title="Shift defaults"
      titleBn="শিফটের ডিফল্ট"
      intro="Values that rarely change are filled in when a shift is closed, so the manager confirms instead of typing."
      introBn="যে মান প্রায় বদলায় না তা শিফট বন্ধ করার সময় আগে থেকে বসানো থাকে — ম্যানেজার শুধু নিশ্চিত করেন।"
      fields={SHIFT_DEFAULT_FIELDS}
      footnote={{
        en: 'The selling rate is pre-filled from the last closed shift, with a yellow notice if it differs from three days ago. Shift times are fixed: day 10:00–22:00, night 22:00–10:00.',
        bn: 'বিক্রয় দর আগের বন্ধ শিফট থেকে বসে; তিন দিন আগের দরের সঙ্গে না মিললে হলুদ সতর্কতা আসে। শিফটের সময় স্থির: দিন ১০:০০–২২:০০, রাত ২২:০০–১০:০০।',
      }}
    />
  );
}
