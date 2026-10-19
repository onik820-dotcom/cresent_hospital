import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import type { Proposal } from '@/lib/chat/proposals';
import { isRole } from '@/lib/roles';

const TurnInput = z.object({
  session_id: z.string().min(1),
  message: z.string().min(1).max(2000),
  lang: z.enum(['bn', 'en']),
});

/**
 * The chat turn, run as the signed-in person.
 *
 * Every read the assistant makes goes through their own client, so Row Level
 * Security answers exactly as it would on a screen. Writes are never made here.
 */
export const chatTurn = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TurnInput.parse(input))
  .handler(async ({ data, context }): Promise<{ reply: string; proposal: Proposal | null }> => {
    const supabase = context.supabase;
    const userId = context.userId;

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name, is_active')
      .eq('id', userId)
      .maybeSingle();

    const row = profile as { role: string; full_name: string | null; is_active: boolean } | null;
    if (!row || !row.is_active || !isRole(row.role) || (row.role !== 'admin' && row.role !== 'md')) {
      return {
        reply:
          data.lang === 'bn'
            ? 'এই অ্যাকাউন্টে সহকারী ব্যবহারের অনুমতি নেই।'
            : 'This account may not use the assistant.',
        proposal: null,
      };
    }

    const { runChatTurn } = await import('@/lib/chat/agent.server');
    return runChatTurn({
      supabase,
      userId,
      role: row.role,
      fullName: row.full_name ?? '',
      sessionId: data.session_id,
      message: data.message,
      lang: data.lang,
    });
  });
