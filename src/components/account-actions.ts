import { supabase } from '@/integrations/supabase/client';
import { createClient } from '@/lib/data/client';
import { getSessionProfile } from '@/lib/session';
import { signalRefresh } from '@/lib/refresh';

/**
 * Account info every signed-in person can see and keep up to date: their own
 * name, phone and preferred language. The role is never editable here — only
 * an admin sets that, on the People page.
 */

export interface MyAccount {
  id: string;
  email: string | null;
  fullName: string;
  fullNameBn: string | null;
  phone: string | null;
  role: string;
  languagePref: 'bn' | 'en';
  isActive: boolean;
  createdAt: string | null;
}

export async function getMyAccount(): Promise<MyAccount | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const client = await createClient();
  const { data } = await client
    .from('profiles')
    .select('id, full_name, full_name_bn, phone, role, language_pref, is_active, created_at')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!data) return null;
  const p = data as any;

  return {
    id: p.id,
    email: auth.user.email ?? null,
    fullName: p.full_name,
    fullNameBn: p.full_name_bn,
    phone: p.phone,
    role: p.role,
    languagePref: p.language_pref,
    isActive: p.is_active,
    createdAt: p.created_at,
  };
}

export interface AccountInput {
  fullName: string;
  fullNameBn?: string;
  phone?: string;
  languagePref: 'bn' | 'en';
}

export async function updateMyAccount(input: AccountInput): Promise<{ ok: boolean; error?: string }> {
  const profile = await getSessionProfile();
  if (!profile) return { ok: false, error: 'You are not signed in' };
  if (!input.fullName.trim()) return { ok: false, error: 'Your name cannot be empty' };

  const client = await createClient();
  const { error } = await client
    .from('profiles')
    .update({
      full_name: input.fullName.trim(),
      full_name_bn: input.fullNameBn?.trim() || null,
      phone: input.phone?.trim() || null,
      language_pref: input.languagePref,
      updated_by: profile.id,
    })
    .eq('id', profile.id);

  if (error) return { ok: false, error: error.message };
  signalRefresh();
  return { ok: true };
}

/** Changing one's own password, from inside the app. */
export async function changeMyPassword(password: string): Promise<{ ok: boolean; error?: string }> {
  if (password.length < 10) return { ok: false, error: 'Use at least 10 characters' };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
