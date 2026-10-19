'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';

/**
 * One window for every form in the app.
 *
 * Whatever the page, an entry form opens the same way: the page dims, the form
 * floats over it, Escape or the cross closes it, and the page behind never
 * scrolls away underneath. Nothing prints.
 */
export function FormWindow({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { lang } = useLang();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`glass max-h-[92vh] w-full overflow-y-auto p-4 sm:p-5 ${
          wide ? 'max-w-3xl' : 'max-w-xl'
        }`}
      >
        <div className="mb-3 flex items-start gap-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight" lang={lang}>
              {title}
            </h2>
            {subtitle ? (
              <p className="text-xs" style={{ color: 'var(--text-faint)' }} lang={lang}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
            className="tap-target ml-auto rounded-lg p-1.5"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}
