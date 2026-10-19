import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/**
 * Creating a working account outright.
 *
 * The station hands out credentials in person: the owner makes the account,
 * writes the email and password down for that person, and they sign in with
 * it. A link that has to be clicked before the account exists is one more
 * thing to go wrong on a forecourt phone.
 *
 * The password is only ever seen here and at the screen that asked for it —
 * it is hashed on the way into the auth table and never read back.
 */
const Input = z.object({
  email: z.string().email().max(160),
  password: z.string().min(10).max(72),
  role: z.enum(['dispenser', 'manager', 'md', 'accountant', 'admin']),
  fullName: z.string().trim().min(1).max(120),
  fullNameBn: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
});

export const createAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    // Only the owner may mint an account, and the check is made as the caller
    // so the database's own rules decide it.
    const { data: me, error: meError } = await context.supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', context.userId)
      .maybeSingle();

    if (meError) return { ok: false as const, error: meError.message };
    if (!me || me.role !== 'admin' || !me.is_active) {
      return { ok: false as const, error: 'Only the owner can create accounts.' };
    }

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // If this email still belongs to a deleted account, release it first.
    for (let page = 1; page <= 10; page++) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      const users = list?.users ?? [];
      const old = users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
      if (old) {
        const { data: prof } = await supabaseAdmin
          .from('profiles').select('deleted_at').eq('id', old.id).maybeSingle();
        if (prof?.deleted_at) {
          const { error: relError } = await supabaseAdmin.auth.admin.updateUserById(old.id, {
            email: `deleted-${old.id}@removed.invalid`,
          });
          if (relError) return { ok: false as const, error: relError.message };
        }
        break;
      }
      if (users.length < 200) break;
    }

    const { error } = await supabaseAdmin.rpc('provision_account', {
      p_email: data.email,
      p_password: data.password,
      p_role: data.role,
      p_full_name: data.fullName,
      p_full_name_bn: data.fullNameBn || undefined,
      p_phone: data.phone || undefined,
      p_created_by: context.userId,
    });

    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

/**
 * Removing an account. The profile is soft-deleted (history stays intact) and
 * the login is banned so the person can no longer sign in.
 */
const DeleteInput = z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(300) });

export const deleteAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => DeleteInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase
      .from('profiles').select('role, is_active').eq('id', context.userId).maybeSingle();
    if (!me || me.role !== 'admin' || !me.is_active) {
      return { ok: false as const, error: 'Only the owner can delete accounts.' };
    }
    if (data.id === context.userId) return { ok: false as const, error: 'You cannot delete your own account.' };

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      ban_duration: '876000h',
      // Free the email so it can be used for a new account later.
      email: `deleted-${data.id}@removed.invalid`,
    });
    if (banError) return { ok: false as const, error: banError.message };

    const { error } = await supabaseAdmin.from('profiles').update({
      deleted_at: new Date().toISOString(), deleted_by: context.userId,
      delete_reason: data.reason, is_active: false,
    }).eq('id', data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });
