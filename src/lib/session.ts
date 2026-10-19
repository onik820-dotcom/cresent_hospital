import { supabase } from "@/integrations/supabase/client";
import type { Role } from "@/lib/roles";
import { isRole } from "@/lib/roles";

export interface SessionProfile {
  id: string;
  fullName: string;
  fullNameBn: string | null;
  role: Role;
  isActive: boolean;
}

/**
 * The signed-in user's profile, or null when there is no session. Uses
 * getUser() (server-verified), then reads the profile row that RLS already
 * scopes to the caller.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, full_name_bn, role, is_active")
    .eq("id", data.user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!profile || !profile.is_active || !isRole(profile.role)) return null;

  return {
    id: profile.id,
    fullName: profile.full_name,
    fullNameBn: profile.full_name_bn,
    role: profile.role,
    isActive: profile.is_active,
  };
}
