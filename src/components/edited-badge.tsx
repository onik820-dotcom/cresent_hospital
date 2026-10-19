'use client';

import { Pencil } from 'lucide-react';
import { useLang } from '@/lib/i18n/provider';
import { formatDateTime } from '@/lib/format';
import type { Editor } from '@/lib/data/audit';

/**
 * A small pencil on a record the admin changed after it was first saved, with
 * the editor's name on hover or tap. Shown to whoever may read the audit log.
 */
export function EditedBadge({ editor }: { editor: Editor | undefined }) {
  const { lang } = useLang();
  if (!editor) return null;
  const text =
    lang === 'bn'
      ? `${editor.name} সংশোধন করেছেন · ${formatDateTime(editor.at, lang)}`
      : `Edited by ${editor.name} · ${formatDateTime(editor.at, lang)}`;
  return (
    <span
      className="inline-flex align-middle"
      title={text}
      aria-label={text}
      role="img"
      tabIndex={0}
      style={{ color: 'var(--color-watch)' }}
    >
      <Pencil className="h-3 w-3" aria-hidden />
    </span>
  );
}
