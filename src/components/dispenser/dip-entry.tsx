'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/lib/compat';
import { Camera, CheckCircle2, Delete, ImageIcon, LoaderCircle, X } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatLitres, formatNumber } from '@/lib/format';
import { preparePhoto, type PreparedImage } from '@/lib/image';
import { enqueue, newId } from '@/lib/offline/queue';
import { cacheChart, convertLocally, getCachedChart, type CachedChart } from '@/lib/offline/charts';
import { supabase as createClientSingleton } from '@/integrations/supabase/client';
const createClient = () => createClientSingleton;
import { Button } from '@/components/jhm/button';
import { Chip, GlassCard, Muted } from '@/components/ui/glass';

export interface TankOption {
  id: string;
  code: string;
  finalDipMm: number;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'] as const;

export function DipEntry({
  shiftId,
  tanks,
  userId,
  dipType,
  onQueued,
}: {
  shiftId: string | null;
  tanks: TankOption[];
  userId: string;
  dipType: 'close' | 'pre_refill' | 'post_refill';
  onQueued: () => void;
}) {
  const { t, lang } = useLang();
  const router = useRouter();

  const [tank, setTank] = useState<TankOption | null>(tanks.length === 1 ? tanks[0]! : null);
  const [chart, setChart] = useState<CachedChart | null>(null);
  const [value, setValue] = useState('');
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ offline: boolean } | null>(null);

  // Live camera + rod scan. The photograph suggests the millimetre figure;
  // the employee confirms or retypes it on the keypad before saving.
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  // The camera must never outlive the screen it serves.
  useEffect(() => stopCamera, []);

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      fileInput.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      // Permission refused or no camera: the file picker is the fallback.
      fileInput.current?.click();
    }
  }

  async function shutter() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    stopCamera();
    setCameraOpen(false);
    if (!blob) return;
    await handleFile(new File([blob], `dip-${Date.now()}.jpg`, { type: 'image/jpeg' }));
  }

  async function handleFile(file: File) {
    const prepared = await preparePhoto(file);
    setPhoto(prepared);
    setScanNote(null);

    // Offline is a normal state here: the number is typed in and the photo
    // travels with it when signal returns.
    if (!navigator.onLine) return;

    // A failed read must never cost the photograph — the employee just types
    // the figure, exactly as they would without the camera.
    setScanning(true);
    try {
      const { readDipPhoto } = await import('@/lib/ocr/dip.functions');
      const result = await readDipPhoto({
        data: {
          imageBase64: prepared.base64,
          mediaType: 'image/jpeg',
          maxDipMm: tank?.finalDipMm,
        },
      });
      if (result?.dipMm) {
        setValue(result.dipMm);
        setScanNote(
          lang === 'bn'
            ? `ছবি থেকে পড়া হয়েছে (${Math.round(result.confidence * 100)}%) — মিলিয়ে দেখুন।`
            : `Read from the photo (${Math.round(result.confidence * 100)}%) — check it against the rod.`,
        );
        if (result.notes) setScanNote((note) => `${note} ${result.notes}`);
      }
    } catch {
      // typed in by hand, same as offline
    } finally {
      setScanning(false);
    }
  }

  // Pull the chart onto the phone the first time a tank is picked, so the rod
  // reading still converts when the signal goes.
  useEffect(() => {
    if (!tank) return;
    let cancelled = false;

    void (async () => {
      const cached = await getCachedChart(tank.id);
      if (!cancelled && cached) setChart(cached);
      if (cached || !navigator.onLine) return;

      const fetched = await cacheChart(createClient(), {
        id: tank.id,
        code: tank.code,
        finalDipMm: tank.finalDipMm,
      });
      if (!cancelled && fetched) setChart(fetched);
    })();

    return () => {
      cancelled = true;
    };
  }, [tank]);

  const dipMm = Number(value);
  const valid = value !== '' && Number.isFinite(dipMm) && tank !== null && dipMm >= 1 && dipMm <= tank.finalDipMm;
  const conversion = chart && valid ? convertLocally(chart, dipMm) : null;
  const outOfRange = value !== '' && tank !== null && (dipMm < 1 || dipMm > tank.finalDipMm);

  // On an "after refill" reading the app already knows the rod before the
  // tanker discharged, so the amount received is arithmetic, not a second
  // form to fill in. It is shown live, and carried up to every account.
  const [beforeDip, setBeforeDip] = useState<{ dipMm: string; litres: string } | null>(null);

  useEffect(() => {
    if (dipType !== 'post_refill' || !tank || !navigator.onLine) {
      setBeforeDip(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from('tank_dips')
        .select('dip_mm, litres')
        .eq('tank_id', tank.id)
        .eq('dip_type', 'pre_refill')
        .is('deleted_at', null)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setBeforeDip(
        data?.litres != null ? { dipMm: String(data.dip_mm), litres: String(data.litres) } : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [dipType, tank, saved]);

  const receivedLitres = beforeDip && conversion ? conversion.litres - Number(beforeDip.litres) : null;
  const received = receivedLitres !== null && receivedLitres > 0 ? receivedLitres.toFixed(3) : null;

  function press(key: string) {
    if (key === 'del') {
      setValue((v) => v.slice(0, -1));
      return;
    }
    if (key === '.' && value.includes('.')) return;
    if (value.length >= 7) return;
    setValue((v) => v + key);
  }

  async function save() {
    if (!tank || !valid) return;
    setBusy(true);

    const id = newId();
    await enqueue({
      id,
      kind: 'dip',
      payload: {
        kind: 'dip',
        shiftId,
        tankId: tank.id,
        dipType,
        dipMm: value,
        localLitres: conversion ? conversion.litres.toFixed(3) : null,
      },
      photo: photo?.blob ?? null,
      photoName: `${id}.jpg`,
      recordedAt: new Date().toISOString(),
    });

    setSaved({ offline: !navigator.onLine });
    setBusy(false);
    onQueued();

    if (navigator.onLine) {
      const { flushQueue } = await import('@/lib/offline/queue');
      await flushQueue(createClient(), userId);
      onQueued();
      router.refresh();
    }
  }

  if (saved) {
    return (
      <GlassCard lift={false} className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 state-ok" aria-hidden />
        <p className="text-lg font-semibold tracking-tight" lang={lang}>
          {saved.offline ? t('dispenser.willSync') : lang === 'bn' ? 'জমা হয়েছে' : 'Submitted'}
        </p>
        <p className="tabular text-2xl font-semibold">
          {formatNumber(value, { lang })} {lang === 'bn' ? 'মিমি' : 'mm'}
        </p>
        {conversion ? <Muted className="tabular">{formatLitres(conversion.litres.toFixed(3), lang)}</Muted> : null}
        {dipType === 'post_refill' && received ? (
          <p className="text-sm font-medium" lang={lang}>
            {lang === 'bn' ? 'ট্যাংকে ঢুকেছে' : 'Received into the tank'}{' '}
            <span className="tabular font-semibold" style={{ color: 'var(--color-accent)' }}>
              {formatLitres(received, lang)}
            </span>
          </p>
        ) : null}


        <div className="flex gap-2">
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              setSaved(null);
              setValue('');
              setPhoto(null);
              setScanNote(null);
            }}
            lang={lang}
          >
            {lang === 'bn' ? 'আরেকটি' : 'Another'}
          </Button>
          <Button variant="ghost" size="lg" className="flex-1" onClick={() => router.push('/dispenser')} lang={lang}>
            {lang === 'bn' ? 'শেষ' : 'Done'}
          </Button>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {tanks.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => {
              setTank(option);
              setChart(null);
              setValue('');
            }}
            className="glass tap-target rounded-2xl px-4 py-5 text-center"
            style={tank?.id === option.id ? { borderColor: 'var(--color-accent)', borderWidth: 2 } : undefined}
          >
            <span className="block text-xl font-semibold tracking-tight">
              {t('tank.tank')} {option.code}
            </span>
            <Muted className="tabular">1 – {formatNumber(option.finalDipMm, { lang })} mm</Muted>
          </button>
        ))}
      </div>

      {tank ? (
        <>
          <GlassCard lift={false} className="text-center">
            <p className="tabular text-4xl font-semibold tracking-tight">
              {value === '' ? '—' : formatNumber(value, { lang })}
              <span className="ml-1 text-lg font-normal" style={{ color: 'var(--text-faint)' }}>
                {lang === 'bn' ? 'মিমি' : 'mm'}
              </span>
            </p>

            <div className="mt-2 min-h-[2rem]" aria-live="polite">
              {outOfRange ? (
                <p className="state-breach text-sm" lang={lang}>
                  {lang === 'bn' ? 'সীমার বাইরে' : 'Outside this tank’s range'}
                </p>
              ) : conversion ? (
                <>
                  <p className="tabular text-2xl font-semibold" style={{ color: 'var(--color-accent)' }}>
                    {formatLitres(conversion.litres.toFixed(3), lang)}
                  </p>
                  {conversion.interpolated ? (
                    <Chip tone="watch" lang={lang}>
                      {t('stock.interpolated')}
                    </Chip>
                  ) : null}
                </>
              ) : value !== '' && !chart ? (
                <Muted lang={lang}>
                  {lang === 'bn' ? 'চার্ট এখনো আসেনি' : 'Chart not on this phone yet'}
                </Muted>
              ) : null}
            </div>

            {dipType === 'post_refill' && beforeDip ? (
              <div className="mt-3 rounded-2xl border border-border/60 px-3 py-2.5 text-left" aria-live="polite">
                <Muted lang={lang}>
                  {lang === 'bn' ? 'রিফিলের আগের ডিপ' : 'Dip before refill'}:{' '}
                  <span className="tabular">
                    {formatNumber(beforeDip.dipMm, { lang })} {lang === 'bn' ? 'মিমি' : 'mm'} ·{' '}
                    {formatLitres(beforeDip.litres, lang)}
                  </span>
                </Muted>
                <p className="mt-1 text-sm font-medium" lang={lang}>
                  {lang === 'bn' ? 'ট্যাংকে ঢুকেছে' : 'Received into the tank'}
                </p>
                <p className="tabular text-2xl font-semibold" style={{ color: 'var(--color-accent)' }}>
                  {received ? formatLitres(received, lang) : '—'}
                </p>
              </div>
            ) : null}
          </GlassCard>

          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                className="glass tap-target rounded-xl py-5 text-2xl font-semibold"
                aria-label={key === 'del' ? (lang === 'bn' ? 'মুছুন' : 'Delete') : key}
              >
                {key === 'del' ? (
                  <Delete className="mx-auto h-5 w-5" aria-hidden />
                ) : key === '.' ? (
                  '.'
                ) : (
                  formatNumber(key, { lang })
                )}
              </button>
            ))}
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />

          {cameraOpen ? (
            <GlassCard lift={false} className="space-y-3">
              <div
                className="relative overflow-hidden rounded-2xl border"
                style={{ borderColor: 'var(--hairline)', background: '#000' }}
              >
                <video ref={videoRef} playsInline muted autoPlay className="w-full" style={{ maxHeight: '50vh' }} />
              </div>
              <Muted className="text-center" lang={lang}>
                {lang === 'bn'
                  ? 'রডের ভেজা রেখাটি সোজা রেখে ছবি তুলুন।'
                  : 'Hold the wet line straight and tap the button.'}
              </Muted>
              <Button variant="glass" size="lg" className="w-full items-center" onClick={() => void shutter()} lang={lang}>
                <Camera className="h-5 w-5" style={{ color: 'var(--color-accent)' }} aria-hidden />
                {lang === 'bn' ? 'ছবি তুলুন' : 'Take photo'}
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="md"
                  className="flex-1"
                  onClick={() => {
                    stopCamera();
                    setCameraOpen(false);
                    fileInput.current?.click();
                  }}
                  lang={lang}
                >
                  <ImageIcon className="h-4 w-4" aria-hidden />
                  {lang === 'bn' ? 'গ্যালারি' : 'Gallery'}
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  className="flex-1"
                  onClick={() => {
                    stopCamera();
                    setCameraOpen(false);
                  }}
                  lang={lang}
                >
                  <X className="h-4 w-4" aria-hidden />
                  {t('common.cancel')}
                </Button>
              </div>
            </GlassCard>
          ) : (
            <button
              type="button"
              onClick={() => void openCamera()}
              className="glass tap-target flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium"
              lang={lang}
            >
              {scanning ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Camera className="h-4 w-4" aria-hidden />
              )}
              {scanning
                ? lang === 'bn'
                  ? 'ছবি পড়া হচ্ছে…'
                  : 'Reading the photo…'
                : photo
                  ? lang === 'bn'
                    ? 'ছবি যুক্ত হয়েছে — আবার তুলুন'
                    : 'Photo attached — retake'
                  : lang === 'bn'
                    ? 'ডিপ রডের ছবি তুলুন (ঐচ্ছিক)'
                    : 'Photograph the dip rod (optional)'}
            </button>
          )}

          {scanNote ? (
            <Muted lang={lang}>{scanNote}</Muted>
          ) : null}

          <Button size="lg" className="w-full" disabled={!valid || busy} onClick={save} lang={lang}>
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {t('common.save')}
          </Button>
        </>
      ) : null}
    </div>
  );
}
