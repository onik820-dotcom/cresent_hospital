import { useEffect, useState } from 'react';
import { getSessionProfile } from '@/lib/session';
import { canEditRecords, type Role } from '@/lib/roles';

let roleCache: Promise<Role | null> | null = null;

/** The signed-in role, fetched once and shared by every row that asks. */
export function useRole(): Role | null {
  const [role, setRole] = useState<Role | null>(null);
  useEffect(() => {
    let alive = true;
    roleCache ??= getSessionProfile().then((p) => p?.role ?? null);
    roleCache.then((r) => alive && setRole(r));
    return () => {
      alive = false;
    };
  }, []);
  return role;
}

/**
 * True only for the admin. The edit and delete buttons render nothing for
 * anyone else — and the database refuses the call regardless, so this is the
 * courtesy, not the control.
 */
export function useCanEdit(): boolean {
  return canEditRecords(useRole());
}

/** Forget the cached role, e.g. after signing out and in as someone else. */
export function resetRoleCache() {
  roleCache = null;
}
