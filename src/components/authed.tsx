import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getSessionProfile, type SessionProfile } from "@/lib/session";
import { canAccess, type Role } from "@/lib/roles";
import { AppShell } from "@/components/app-shell";
import { useLang } from "@/lib/i18n/provider";
import { GlassCard, Muted, Skeleton } from "@/components/ui/glass";

/**
 * Client-side gate for every authenticated page: loads the verified profile,
 * sends anonymous visitors to /login, refuses roles outside their sections,
 * and wraps allowed pages in the shared shell.
 */
export function Authed({
  path,
  roles,
  bare = false,
  children,
}: {
  path: string;
  roles: Role[];
  /** Bare pages render without the nav shell (e.g. the dispenser forecourt). */
  bare?: boolean;
  children: (profile: SessionProfile) => React.ReactNode;
}) {
  const [profile, setProfile] = useState<SessionProfile | null>(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { t, lang } = useLang();

  useEffect(() => {
    let cancelled = false;
    getSessionProfile().then((p) => {
      if (cancelled) return;
      if (!p) {
        navigate({ to: "/login", search: { next: path } });
        return;
      }
      setProfile(p);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [path, navigate]);

  if (!ready || !profile) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <GlassCard lift={false}>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </GlassCard>
      </main>
    );
  }

  if (!roles.includes(profile.role) || !canAccess(profile.role, path)) {
    return (
      <AppShell role={profile.role} fullName={profile.fullName}>
        <GlassCard lift={false}>
          <p className="state-breach text-sm font-medium" role="alert" lang={lang}>
            {t("auth.denied")}
          </p>
          <Muted className="mt-1" lang={lang}>
            {profile.fullName}
          </Muted>
        </GlassCard>
      </AppShell>
    );
  }

  if (bare) return <>{children(profile)}</>;

  return (
    <AppShell role={profile.role} fullName={profile.fullName}>
      {children(profile)}
    </AppShell>
  );
}
