'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from '@/lib/compat';
import { Camera, CheckCircle2, ImageIcon, LoaderCircle, RotateCcw, WifiOff, X } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatNumber } from '@/lib/format';
import { preparePhoto, type PreparedImage } from '@/lib/image';
import { enqueue, newId } from '@/lib/offline/queue';
import { Button } from '@/components/jhm/button';
import { Chip, GlassCard, Muted } from '@/components/ui/glass';

export interface NozzleOption {
  nozzleId: string;
  dispenserCode: string;
  nozzleNo: number;
  tankCode: string;
}

interface OcrResult {
  machineNo: string | null;
  reading: string | null;
  amount: string | null;
  confidence: number;
  notes: string | null;
}

type Step = 'capture' | 'camera' | 'confirm';

export function MeterCapture({
  shiftId,
  nozzles,
  userId,
  onQueued,
}: {
  shiftId: string;
  nozzles: NozzleOption[];
  userId: string;
  onQueued: () => void;
}) {
  const { t, lang } = useLang();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  // The camera must never outlive the screen it serves.
  useEffect(() => stopCamera, []);

  async function openCamera() {
    setError(null);
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      // No camera API (rare, or an insecure context): fall back to the file
      // picker, which on phones still offers the camera.
      fileInput.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      setStep('camera');
      // The <video> mounts with the step; attach on the next tick.
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

  function closeCamera() {
    stopCamera();
    setStep('capture');
  }

  async function shutter() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      setCameraError(lang === 'bn' ? 'ছবিটি নেওয়া গেল না' : 'That photo could not be used');
      return;
    }
    stopCamera();
    void handleFile(new File([blob], `meter-${Date.now()}.jpg`, { type: 'image/jpeg' }));
  }

  const [step, setStep] = useState<Step>('capture');
  // The photograph decides the machine: the AI reads the number off the
  // meter face and the matching nozzle is pre-selected, with the chips
  // there to correct it when the number could not be read.
  const [nozzleId, setNozzleId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Array<{ dispenserCode: string; reading: string; amount: string | null }>>([]);
  const [readingType, setReadingType] = useState<'open' | 'close'>('close');
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [reading, setReading] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);

  const nozzle = nozzles.find((n) => n.nozzleId === nozzleId) ?? null;

  function matchMachine(machineNo: string | null): string | null {
    if (!machineNo) return null;
    const wanted = machineNo.trim().toUpperCase();
    const hit = nozzles.find((n) => n.dispenserCode.toUpperCase() === wanted);
    if (hit) return hit.nozzleId;
    // Tolerate a bare digit ("3" for M3) or a code the AI padded out.
    const loose = nozzles.find(
      (n) =>
        n.dispenserCode.toUpperCase().endsWith(wanted) ||
        wanted.endsWith(n.dispenserCode.toUpperCase()),
    );
    return loose?.nozzleId ?? null;
  }

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const prepared = await preparePhoto(file);
      setPhoto(prepared);
      setStep('confirm');

      // Offline is a normal state here, not a failure: the employee picks the
      // machine and types the number, and the photo travels when signal returns.
      if (!navigator.onLine) {
        setOcr(null);
        setBusy(false);
        return;
      }

      // A failed read must never cost the photograph. Anything other than a
      // well-formed answer just means the number gets typed in by hand, which
      // is the same path the employee takes when the forecourt has no signal.
      let result: OcrResult | null = null;
      try {
        const { readMeterPhoto } = await import('@/lib/ocr/meter.functions');
        result = (await readMeterPhoto({
          data: {
            imageBase64: prepared.base64,
            mediaType: 'image/jpeg',
            knownMachines: [...new Set(nozzles.map((n) => n.dispenserCode))],
          },
        })) as OcrResult | null;
      } catch {
        result = null;
      }

      setOcr(result);
      if (result?.reading) setReading(result.reading);
      if (result?.amount) setAmount(result.amount);
      const matched = matchMachine(result?.machineNo ?? null);
      if (matched) setNozzleId(matched);
    } catch {
      // Only a failure to process the image itself lands here; the photo is
      // unusable, so the employee has to take another.
      setError(lang === 'bn' ? 'ছবিটি নেওয়া গেল না' : 'That photo could not be used');
      setStep('capture');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!nozzle || !reading.trim()) return;
    setBusy(true);
    setError(null);

    const id = newId();
    await enqueue({
      id,
      kind: 'meter',
      payload: {
        kind: 'meter',
        shiftId,
        nozzleId: nozzle.nozzleId,
        readingType,
        reading: reading.trim(),
        isRollover: false,
        aiExtracted: ocr
          ? { ...ocr, confirmedReading: reading.trim(), confirmedAmount: amount.trim() || null }
          : amount.trim()
            ? { confirmedAmount: amount.trim() }
            : null,
        aiConfidence: ocr ? ocr.confidence : null,
      },
      photo: photo?.blob ?? null,
      photoName: `${id}.jpg`,
      recordedAt: new Date().toISOString(),
    });

    setSaved((rows) => [
      ...rows,
      { dispenserCode: nozzle.dispenserCode, reading: reading.trim(), amount: amount.trim() || null },
    ]);
    setSavedOffline(!navigator.onLine);

    // Back to the camera for whichever machine is read next.
    setPhoto(null);
    setOcr(null);
    setReading('');
    setAmount('');
    setNozzleId(null);
    setStep('capture');
    setBusy(false);
    onQueued();

    // Online, the sync loop picks it up within moments.
    if (navigator.onLine) {
      const { flushQueue } = await import('@/lib/offline/queue');
      const { createClient } = await import('@/lib/data/client');
      await flushQueue(createClient(), userId);
      onQueued();
      router.refresh();
    }
  }

  // ---- step: take the photograph -------------------------------------------
  if (step === 'capture') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {(['open', 'close'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setReadingType(type)}
              className="glass tap-target rounded-2xl px-4 py-4 text-center text-base font-medium"
              style={
                readingType === type ? { borderColor: 'var(--color-accent)', borderWidth: 2 } : undefined
              }
              lang={lang}
            >
              {type === 'open'
                ? lang === 'bn'
                  ? 'ডে শিফট'
                  : 'Day shift'
                : lang === 'bn'
                  ? 'নাইট শিফট'
                  : 'Night shift'}
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

        <Button
          variant="glass"
          size="forecourt"
          className="w-full items-center"
          disabled={busy}
          onClick={() => void openCamera()}
          lang={lang}
        >
          {busy ? (
            <LoaderCircle className="mb-2 h-8 w-8 animate-spin" style={{ color: 'var(--color-accent)' }} aria-hidden />
          ) : (
            <Camera className="mb-2 h-8 w-8" style={{ color: 'var(--color-accent)' }} aria-hidden />
          )}
          {t('dispenser.takeReading')}
        </Button>

        <Muted className="text-center" lang={lang}>
          {lang === 'bn'
            ? 'প্রতি বিক্রিতে ছবি লাগবে না — শিফট শেষে একবার প্রতিটি নজলের ছবি নিন। ছবি থেকে মেশিন নম্বর, লিটার ও টাকার পরিমাণ নিজে থেকেই পড়া হবে।'
            : 'No photo per sale — take one photo of each nozzle at the end of the shift. Machine number, litres and taka are read from the photo.'}
        </Muted>

        {error ? (
          <p className="state-breach text-center text-sm" role="alert">
            {error}
          </p>
        ) : null}

        {saved.length > 0 ? (
          <GlassCard lift={false} className="space-y-2">
            <p className="text-sm font-semibold tracking-tight" lang={lang}>
              {lang === 'bn' ? 'জমা দেওয়া হয়েছে' : 'Submitted this session'}
            </p>
            <div className="space-y-1">
              {saved.map((row, i) => (
                <div key={`${row.dispenserCode}-${i}`} className="flex items-center justify-between text-sm">
                  <Muted>{row.dispenserCode}</Muted>
                  <span className="tabular font-semibold">
                    {row.reading}
                    {row.amount ? ` · ৳${row.amount}` : ''}
                  </span>
                </div>
              ))}
            </div>
            {savedOffline ? (
              <Muted lang={lang}>{t('dispenser.willSync')}</Muted>
            ) : null}
          </GlassCard>
        ) : null}
      </div>
    );
  }

  // ---- step: the live camera ----------------------------------------------
  if (step === 'camera') {
    return (
      <div className="space-y-4">
        <div
          className="relative overflow-hidden rounded-2xl border"
          style={{ borderColor: 'var(--hairline)', background: '#000' }}
        >
          <video ref={videoRef} playsInline muted autoPlay className="w-full" style={{ maxHeight: '60vh' }} />
        </div>

        {cameraError ? (
          <p className="state-breach text-center text-sm" role="alert">
            {cameraError}
          </p>
        ) : null}

        <Muted className="text-center" lang={lang}>
          {lang === 'bn'
            ? 'মিটারের সংখ্যাটি সোজা রেখে ছবি তুলুন।'
            : 'Hold the meter straight and tap the button.'}
        </Muted>

        <Button variant="glass" size="forecourt" className="w-full items-center" onClick={() => void shutter()} lang={lang}>
          <Camera className="mb-2 h-8 w-8" style={{ color: 'var(--color-accent)' }} aria-hidden />
          {lang === 'bn' ? 'ছবি তুলুন' : 'Take photo'}
        </Button>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="md"
            className="flex-1"
            onClick={() => {
              stopCamera();
              fileInput.current?.click();
            }}
            lang={lang}
          >
            <ImageIcon className="h-4 w-4" aria-hidden />
            {lang === 'bn' ? 'গ্যালারি' : 'Gallery'}
          </Button>
          <Button variant="ghost" size="md" className="flex-1" onClick={closeCamera} lang={lang}>
            <X className="h-4 w-4" aria-hidden />
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  // ---- step: photo and number, side by side, confirm or retype -------------
  const lowConfidence = ocr !== null && ocr.confidence < 0.9;

  return (
    <div className="space-y-4">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.dataUrl}
          alt={lang === 'bn' ? 'মিটারের ছবি' : 'Meter photo'}
          className="w-full rounded-2xl border"
          style={{ borderColor: 'var(--hairline)' }}
        />
      ) : null}

      <GlassCard lift={false} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip lang={lang}>
            {readingType === 'open'
              ? lang === 'bn'
                ? 'ডে শিফট'
                : 'Day shift'
              : lang === 'bn'
                ? 'নাইট শিফট'
                : 'Night shift'}
          </Chip>
          {busy ? (
            <Chip lang={lang}>
              <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
              {t('common.loading')}
            </Chip>
          ) : ocr ? (
            <Chip tone={lowConfidence ? 'watch' : 'ok'} lang={lang}>
              {lang === 'bn' ? 'এআই পড়েছে' : 'AI read'} {formatNumber(Math.round(ocr.confidence * 100), { lang })}%
            </Chip>
          ) : (
            <Chip tone="watch" lang={lang}>
              <WifiOff className="h-3 w-3" aria-hidden />
              {lang === 'bn' ? 'হাতে লিখুন' : 'Type it in'}
            </Chip>
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {lang === 'bn' ? 'কোন মেশিন?' : 'Which machine?'}
          </span>
          <div className="flex flex-wrap gap-2">
            {nozzles.map((option) => {
              const active = option.nozzleId === nozzleId;
              return (
                <button
                  key={option.nozzleId}
                  type="button"
                  onClick={() => setNozzleId(option.nozzleId)}
                  className="glass tap-target rounded-xl px-4 py-3 text-base font-semibold"
                  style={active ? { borderColor: 'var(--color-accent)', borderWidth: 2 } : undefined}
                >
                  {option.dispenserCode}
                  {option.nozzleNo > 1 ? ` · ${option.nozzleNo}` : ''}
                </button>
              );
            })}
          </div>
          {ocr?.machineNo && !nozzle ? (
            <Muted lang={lang}>
              {lang === 'bn'
                ? `ছবিতে "${ocr.machineNo}" পড়া গেছে — মিলে না, সঠিকটি চাপুন।`
                : `The photo read "${ocr.machineNo}" — no match, tap the right one.`}
            </Muted>
          ) : null}
        </div>

        {ocr?.notes ? <Muted>{ocr.notes}</Muted> : null}

        <label className="block space-y-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {lang === 'bn' ? 'মিটার রিডিং' : 'Meter reading'}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={reading}
            onChange={(e) => setReading(e.target.value)}
            className="tabular tap-target w-full rounded-xl border bg-transparent px-4 py-4 text-3xl font-semibold outline-none"
            style={{ borderColor: lowConfidence ? 'var(--color-watch)' : 'var(--hairline)' }}
            autoFocus
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }} lang={lang}>
            {lang === 'bn' ? 'টাকার পরিমাণ (ডিসপ্লেতে)' : 'Taka amount (on display)'}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={lang === 'bn' ? 'ঐচ্ছিক' : 'Optional'}
            className="tabular tap-target w-full rounded-xl border bg-transparent px-4 py-4 text-2xl font-semibold outline-none"
            style={{ borderColor: 'var(--hairline)' }}
          />
        </label>

        <Muted lang={lang}>
          {lang === 'bn'
            ? 'সংখ্যাগুলো মিটারের সাথে মিলিয়ে দেখুন। ভুল হলে এখানেই ঠিক করুন।'
            : 'Check the numbers against the meter. Correct them here if wrong.'}
        </Muted>

        {error ? (
          <p className="state-breach text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button size="lg" className="flex-1" disabled={busy || !reading.trim() || !nozzle} onClick={save} lang={lang}>
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {t('common.confirm')}
          </Button>
          <Button variant="ghost" size="lg" onClick={() => void openCamera()} lang={lang}>
            <RotateCcw className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
