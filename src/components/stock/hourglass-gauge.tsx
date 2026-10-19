'use client';

/**
 * T1 and T2 have an excess chamber above the 12,000 L main tank. Their
 * calibration chart runs straight on past the main tank's full mark, so the
 * total litres come from one chart; this only splits them for display.
 */
const MAIN_LITRES: Record<string, number> = { T1: 12000, T2: 12000 };

export function excessSplit(code: string, litres: number, capacity: number) {
  const main = MAIN_LITRES[code];
  if (!main || capacity <= main) return null;
  return {
    mainCap: main,
    excessCap: capacity - main,
    mainLitres: Math.min(Math.max(litres, 0), main),
    excessLitres: Math.max(litres - main, 0),
  };
}

export function HourglassGauge({
  code,
  litres,
  capacity,
  fillPct,
  size = 'md',
}: {
  code: string;
  litres: number;
  capacity: number;
  fillPct: number | null;
  size?: 'md' | 'lg';
}) {
  const split = excessSplit(code, litres, capacity);
  const fill = fillPct ?? 0;
  const tone = fillPct === null ? 'neutral' : fill < 15 ? 'breach' : fill < 30 ? 'watch' : 'ok';
  const color = tone === 'breach' ? 'var(--color-breach)' : tone === 'watch' ? 'var(--color-watch)' : 'var(--color-accent)';
  const w = size === 'lg' ? 'w-12' : 'w-10';
  const h = size === 'lg' ? 'h-40' : 'h-32';

  const Chamber = ({ pct, className, bg }: { pct: number; className: string; bg: string }) => (
    <div className={`relative overflow-hidden rounded-lg ${className}`} style={{ background: 'var(--hairline)' }}>
      <div
        className="absolute inset-x-0 bottom-0 transition-[height] duration-500"
        style={{ height: `${Math.min(100, Math.max(0, pct))}%`, background: bg, opacity: 0.85 }}
      />
    </div>
  );

  if (!split) {
    return (
      <div role="img" aria-label={`${code} ${fill}%`} className={`shrink-0 ${w}`}>
        <Chamber pct={fill} className={`${h} w-full`} bg={color} />
      </div>
    );
  }

  const mainPct = (split.mainLitres / split.mainCap) * 100;
  const excessPct = (split.excessLitres / split.excessCap) * 100;
  return (
    <div role="img" aria-label={`${code} main ${mainPct.toFixed(0)}%, excess ${excessPct.toFixed(0)}%`} className={`flex shrink-0 flex-col items-center ${w}`}>
      <Chamber pct={excessPct} className={`${size === 'lg' ? 'h-14' : 'h-11'} w-full`} bg="var(--color-ok, var(--color-accent))" />
      <div className="h-2 w-2" style={{ background: 'var(--hairline)' }} />
      <Chamber pct={mainPct} className={`${size === 'lg' ? 'h-24' : 'h-[4.5rem]'} w-full`} bg={color} />
    </div>
  );
}
