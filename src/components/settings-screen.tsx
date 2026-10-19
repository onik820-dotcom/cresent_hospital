'use client';

import { useState } from 'react';
import { Droplets, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatBDT, formatNumber } from '@/lib/format';
import { Button } from '@/components/jhm/button';
import { Chip, EmptyState, GlassCard, Muted } from '@/components/ui/glass';
import { FormWindow } from '@/components/ui/form-window';
import { TruckCapacityCard } from '@/components/settings/truck-capacity-card';
import { BankNamesCard } from '@/components/settings/bank-names-card';
import { ExpenseHeadsCard } from '@/components/settings/expense-heads-card';
import { deletePartyName, deleteSku, savePartyName, saveSku } from '@/components/settings-actions';
import type { PartyOption, SettingsOptions, SkuOption } from '@/lib/data/settings';

const FIELD = 'tap-target w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none';
const BORDER = { borderColor: 'var(--hairline)' } as const;

/**
 * The lists behind the dropdowns.
 *
 * Party names and lubricant products are typed once here, and every screen
 * that offers a choice reads the same rows — so a name cannot be spelled two
 * ways in two places. The unit sits beside the product because litres and
 * kilograms are not interchangeable: grease is sold by weight.
 */
export function SettingsScreen({ options }: { options: SettingsOptions }) {
  const { lang } = useLang();
  const [party, setParty] = useState<PartyOption | null | 'new'>(null);
  const [sku, setSku] = useState<SkuOption | null | 'new'>(null);
  const [removing, setRemoving] = useState<{ kind: 'party' | 'sku'; id: string; label: string } | null>(null);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold tracking-tight" lang={lang}>
          {lang === 'bn' ? 'সেটিংস' : 'Settings'}
        </h1>
        <Muted lang={lang}>
          {lang === 'bn'
            ? 'ড্রপডাউনে যে নামগুলো আসবে সেগুলো এখানে ঠিক করা হয়।'
            : 'What every dropdown in the app offers is set here.'}
        </Muted>
      </header>

      <TruckCapacityCard />
      <BankNamesCard />
      <ExpenseHeadsCard />

      <GlassCard lift={false}>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
            {lang === 'bn' ? 'পার্টির নাম' : 'Party names'}
          </h2>
          <Button size="sm" className="ml-auto" lang={lang} onClick={() => setParty('new')}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {lang === 'bn' ? 'নতুন পার্টি' : 'New party'}
          </Button>
        </div>

        {options.parties.length === 0 ? (
          <EmptyState title={lang === 'bn' ? 'কোনো পার্টি নেই' : 'No parties yet'} />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
            {options.parties.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="text-sm font-medium" lang={lang}>
                  {lang === 'bn' && p.nameBn ? p.nameBn : p.name}
                </span>
                <Chip tone={p.isActive ? 'ok' : 'neutral'} lang={lang}>
                  {p.isActive ? (lang === 'bn' ? 'চালু' : 'Active') : lang === 'bn' ? 'বন্ধ' : 'Off'}
                </Chip>
                <button
                  type="button"
                  className="tap-target ml-auto rounded-lg p-2"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label={lang === 'bn' ? 'সম্পাদনা' : 'Edit'}
                  onClick={() => setParty(p)}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className="tap-target rounded-lg p-2 state-breach"
                  aria-label={lang === 'bn' ? 'মুছে ফেলুন' : 'Delete'}
                  onClick={() =>
                    setRemoving({ kind: 'party', id: p.id, label: lang === 'bn' && p.nameBn ? p.nameBn : p.name })
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard lift={false}>
        <div className="mb-3 flex items-center gap-2">
          <Droplets className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight" lang={lang}>
            {lang === 'bn' ? 'লুব্রিক্যান্টের নাম ও একক' : 'Lubricants and units'}
          </h2>
          <Button size="sm" className="ml-auto" lang={lang} onClick={() => setSku('new')}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {lang === 'bn' ? 'নতুন লুব্রিক্যান্ট' : 'New lubricant'}
          </Button>
        </div>

        {options.skus.length === 0 ? (
          <EmptyState title={lang === 'bn' ? 'কোনো পণ্য নেই' : 'No products yet'} />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
            {options.skus.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="text-sm font-medium" lang={lang}>
                  {lang === 'bn' && s.nameBn ? s.nameBn : s.name}
                </span>
                <Chip lang={lang}>{s.unit === 'pcs' ? (lang === 'bn' ? 'পিস' : 'PCS') : s.unit === 'kg' ? (lang === 'bn' ? 'কেজি' : 'kg') : lang === 'bn' ? 'লিটার' : 'litre'}</Chip>
                <Muted className="tabular">
                  {s.packSizeLitres
                    ? `${formatNumber(s.packSizeLitres, { lang, decimals: 2 })} ${
                        s.unit === 'pcs' ? (lang === 'bn' ? 'পিস' : 'PCS') : s.unit === 'kg' ? (lang === 'bn' ? 'কেজি' : 'kg') : lang === 'bn' ? 'লিটার' : 'L'
                      } · `
                    : ''}
                  {formatBDT(s.saleRate, lang)}
                </Muted>
                <button
                  type="button"
                  className="tap-target ml-auto rounded-lg p-2"
                  style={{ color: 'var(--text-muted)' }}
                  aria-label={lang === 'bn' ? 'সম্পাদনা' : 'Edit'}
                  onClick={() => setSku(s)}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className="tap-target rounded-lg p-2 state-breach"
                  aria-label={lang === 'bn' ? 'মুছে ফেলুন' : 'Delete'}
                  onClick={() =>
                    setRemoving({ kind: 'sku', id: s.id, label: lang === 'bn' && s.nameBn ? s.nameBn : s.name })
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {party ? <PartyWindow party={party === 'new' ? null : party} onClose={() => setParty(null)} /> : null}
      {sku ? <SkuWindow sku={sku === 'new' ? null : sku} onClose={() => setSku(null)} /> : null}
      {removing ? <RemoveWindow target={removing} onClose={() => setRemoving(null)} /> : null}
    </div>
  );
}

function RemoveWindow({
  target,
  onClose,
}: {
  target: { kind: 'party' | 'sku'; id: string; label: string };
  onClose: () => void;
}) {
  const { lang } = useLang();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result =
      target.kind === 'party' ? await deletePartyName(target.id, reason) : await deleteSku(target.id, reason);
    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Could not remove');
    onClose();
  };

  return (
    <FormWindow
      title={lang === 'bn' ? 'মুছে ফেলুন' : 'Remove'}
      subtitle={target.label}
      onClose={onClose}
    >
      <div className="space-y-3">
        <Muted lang={lang}>
          {lang === 'bn'
            ? 'নামটি সব ড্রপডাউন থেকে সরে যাবে; আগের হিসাব থাকবে। কারণটি লিখুন।'
            : 'The name leaves every dropdown; past sales under it stay in the books. A short reason, please.'}
        </Muted>
        <Labeled label={lang === 'bn' ? 'কারণ' : 'Reason'}>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={FIELD}
            style={BORDER}
            placeholder={lang === 'bn' ? 'যেমন: ভুল নাম / আর বিক্রি হয় না' : 'e.g. wrong name / no longer sold'}
          />
        </Labeled>
        {error ? (
          <p className="state-breach text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button size="lg" disabled={busy || !reason.trim()} onClick={submit} lang={lang}>
            {lang === 'bn' ? 'মুছে ফেলুন' : 'Remove'}
          </Button>
          <Button size="lg" variant="ghost" onClick={onClose} lang={lang}>
            {lang === 'bn' ? 'বাতিল' : 'Cancel'}
          </Button>
        </div>
      </div>
    </FormWindow>
  );
}

function PartyWindow({ party, onClose }: { party: PartyOption | null; onClose: () => void }) {
  const { lang } = useLang();
  const [name, setName] = useState(party?.name ?? '');
  const [nameBn, setNameBn] = useState(party?.nameBn ?? '');
  const [type, setType] = useState<'company' | 'individual' | 'govt'>(
    (party?.type as 'company' | 'individual' | 'govt') ?? 'company',
  );
  const [active, setActive] = useState(party?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await savePartyName({ id: party?.id, name, name_bn: nameBn, type, is_active: active });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Could not save');
    onClose();
  };

  return (
    <FormWindow
      title={party ? (lang === 'bn' ? 'পার্টি সম্পাদনা' : 'Edit party') : lang === 'bn' ? 'নতুন পার্টি' : 'New party'}
      subtitle={lang === 'bn' ? 'এই নাম সব ড্রপডাউনে আসবে' : 'This name appears in every dropdown'}
      onClose={onClose}
    >
      <div className="space-y-3">
        <Labeled label={lang === 'bn' ? 'নাম (ইংরেজি)' : 'Name'}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} style={BORDER} />
        </Labeled>
        <Labeled label={lang === 'bn' ? 'নাম (বাংলা)' : 'Name in Bangla'}>
          <input value={nameBn} onChange={(e) => setNameBn(e.target.value)} className={FIELD} style={BORDER} />
        </Labeled>
        <Labeled label={lang === 'bn' ? 'ধরন' : 'Type'}>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={FIELD} style={BORDER}>
            <option value="company">{lang === 'bn' ? 'কোম্পানি' : 'Company'}</option>
            <option value="individual">{lang === 'bn' ? 'ব্যক্তি' : 'Individual'}</option>
            <option value="govt">{lang === 'bn' ? 'সরকারি' : 'Government'}</option>
          </select>
        </Labeled>
        <label className="flex items-center gap-2 text-sm" lang={lang}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {lang === 'bn' ? 'ড্রপডাউনে দেখাবে' : 'Show in dropdowns'}
        </label>

        {error ? (
          <p className="state-breach text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button size="lg" disabled={busy} onClick={submit} lang={lang}>
            {lang === 'bn' ? 'সংরক্ষণ' : 'Save'}
          </Button>
          <Button size="lg" variant="ghost" onClick={onClose} lang={lang}>
            {lang === 'bn' ? 'বাতিল' : 'Cancel'}
          </Button>
        </div>
      </div>
    </FormWindow>
  );
}

function SkuWindow({ sku, onClose }: { sku: SkuOption | null; onClose: () => void }) {
  const { lang } = useLang();
  const [name, setName] = useState(sku?.name ?? '');
  const [nameBn, setNameBn] = useState(sku?.nameBn ?? '');
  const [brand, setBrand] = useState(sku?.brand ?? '');
  const [packType, setPackType] = useState<'loose' | 'can' | 'drum' | 'grease'>(
    (sku?.packType as 'loose' | 'can' | 'drum' | 'grease') ?? 'can',
  );
  const [unit, setUnit] = useState<'litre' | 'kg' | 'pcs'>((sku?.unit as 'litre' | 'kg' | 'pcs') ?? 'litre');
  const [packSize, setPackSize] = useState(sku?.packSizeLitres ?? '');
  const [rate, setRate] = useState(sku?.saleRate ?? '');
  const [active, setActive] = useState(sku?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await saveSku({
      id: sku?.id,
      name,
      name_bn: nameBn,
      brand,
      pack_type: packType,
      pack_size: packSize,
      unit,
      sale_rate: rate,
      is_active: active,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? 'Could not save');
    onClose();
  };

  return (
    <FormWindow
      title={sku ? (lang === 'bn' ? 'লুব্রিক্যান্ট সম্পাদনা' : 'Edit lubricant') : lang === 'bn' ? 'নতুন লুব্রিক্যান্ট' : 'New lubricant'}
      subtitle={lang === 'bn' ? 'নাম ও একক সব ড্রপডাউনে আসবে' : 'The name and unit appear in every dropdown'}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Labeled label={lang === 'bn' ? 'নাম (ইংরেজি)' : 'Name'}>
            <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} style={BORDER} />
          </Labeled>
          <Labeled label={lang === 'bn' ? 'নাম (বাংলা)' : 'Name in Bangla'}>
            <input value={nameBn} onChange={(e) => setNameBn(e.target.value)} className={FIELD} style={BORDER} />
          </Labeled>
          <Labeled label={lang === 'bn' ? 'ব্র্যান্ড' : 'Brand'}>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className={FIELD} style={BORDER} />
          </Labeled>
          <Labeled label={lang === 'bn' ? 'প্যাক' : 'Pack'}>
            <select
              value={packType}
              onChange={(e) => {
                const next = e.target.value as typeof packType;
                setPackType(next);
                if (next === 'grease') setUnit('kg');
              }}
              className={FIELD}
              style={BORDER}
            >
              <option value="loose">{lang === 'bn' ? 'খোলা' : 'Loose'}</option>
              <option value="can">{lang === 'bn' ? 'ক্যান' : 'Can'}</option>
              <option value="drum">{lang === 'bn' ? 'ড্রাম' : 'Drum'}</option>
              <option value="grease">{lang === 'bn' ? 'গ্রিজ' : 'Grease'}</option>
            </select>
          </Labeled>
          <Labeled label={lang === 'bn' ? 'একক' : 'Unit'}>
            <select value={unit} onChange={(e) => setUnit(e.target.value as 'litre' | 'kg' | 'pcs')} className={FIELD} style={BORDER}>
              <option value="litre">{lang === 'bn' ? 'লিটার' : 'Litre'}</option>
              <option value="kg">{lang === 'bn' ? 'কেজি' : 'Kilogram (kg)'}</option>
              <option value="pcs">{lang === 'bn' ? 'পিস' : 'Pieces (PCS)'}</option>
            </select>
          </Labeled>
          <Labeled
            label={
              unit === 'pcs'
                ? lang === 'bn'
                  ? 'প্যাকে পিস সংখ্যা'
                  : 'Pieces per pack'
                : unit === 'kg'
                ? lang === 'bn'
                  ? 'প্যাকের ওজন (কেজি)'
                  : 'Pack weight (kg)'
                : lang === 'bn'
                  ? 'প্যাকের পরিমাণ (লিটার)'
                  : 'Pack size (litres)'
            }
          >
            <input
              value={packSize}
              inputMode="decimal"
              onChange={(e) => setPackSize(e.target.value)}
              className={`tabular ${FIELD}`}
              style={BORDER}
            />
          </Labeled>
          <Labeled label={lang === 'bn' ? 'বিক্রয় দর' : 'Sale rate'}>
            <input
              value={rate}
              inputMode="decimal"
              onChange={(e) => setRate(e.target.value)}
              className={`tabular ${FIELD}`}
              style={BORDER}
            />
          </Labeled>
        </div>

        <label className="flex items-center gap-2 text-sm" lang={lang}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          {lang === 'bn' ? 'ড্রপডাউনে দেখাবে' : 'Show in dropdowns'}
        </label>

        {error ? (
          <p className="state-breach text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button size="lg" disabled={busy} onClick={submit} lang={lang}>
            {lang === 'bn' ? 'সংরক্ষণ' : 'Save'}
          </Button>
          <Button size="lg" variant="ghost" onClick={onClose} lang={lang}>
            {lang === 'bn' ? 'বাতিল' : 'Cancel'}
          </Button>
        </div>
      </div>
    </FormWindow>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  const { lang } = useLang();
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
        {label}
      </span>
      {children}
    </label>
  );
}
