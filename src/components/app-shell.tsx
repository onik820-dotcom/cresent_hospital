import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Fuel, LayoutDashboard, LogOut, Menu, Settings, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n/provider";
import type { TranslationKey } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/roles";
import { BUCKET_LABEL, activeBucket, isActivePath, navFor, type NavGroup, type NavItem } from "@/lib/nav";
import { LanguageToggle } from "@/components/language-toggle";
import { Chip } from "@/components/ui/glass";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const ROLE_LABEL: Record<Role, TranslationKey> = {
  dispenser: "role.dispenser",
  manager: "role.manager",
  admin: "role.admin",
  md: "role.md",
  accountant: "role.accountant",
};

export function AppShell({
  role,
  fullName,
  children,
}: {
  role: Role;
  fullName: string;
  children: React.ReactNode;
}) {
  const { t, lang } = useLang();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const nav = navFor(role);
  const currentBucket = activeBucket(nav, pathname);
  const hasNav = nav.groups.length > 0;
  const [openBucket, setOpenBucket] = useState<NavGroup | null>(null);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6 sm:pt-4 no-print">
        <div className="glass mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-3 py-2.5 sm:px-4" style={{ background: "var(--surface-solid)", backdropFilter: "none" }}>
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
            >
              <Fuel className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight" lang={lang}>
                {t("app.name")}
              </span>
              <span className="block truncate text-[11px]" style={{ color: "var(--text-faint)" }}>
                {fullName}
              </span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <Chip lang={lang}>{t(ROLE_LABEL[role])}</Chip>
            <LanguageToggle />
            <Link
              to="/account"
              aria-label={t("nav.account")}
              title={t("nav.account")}
              className="tap-target inline-flex items-center justify-center rounded-xl px-2.5 py-2"
              style={{ color: isActivePath(pathname, "/account") ? "var(--color-accent)" : "var(--text-muted)" }}
            >
              <UserRound className="h-4 w-4" aria-hidden />
            </Link>
            {role === "admin" ? (
              <Link
                to="/settings"
                aria-label={t("nav.settings")}
                title={t("nav.settings")}
                className="tap-target hidden items-center justify-center rounded-xl px-2.5 py-2 sm:inline-flex"
                style={{
                  color: pathname === "/settings" ? "var(--color-accent)" : "var(--text-muted)",
                }}
              >
                <Settings className="h-4 w-4" aria-hidden />
              </Link>
            ) : null}
            <button
              type="button"
              onClick={signOut}
              className="tap-target inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
              lang={lang}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">{t("auth.signOut")}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 sm:px-6">
        {hasNav ? (
          <aside className="no-print hidden w-52 shrink-0 md:block">
            <nav className="sticky top-24 space-y-5 py-5 sm:py-7" aria-label={t("nav.sections")}>
              {nav.home ? <SideLink item={nav.home} active={isActivePath(pathname, nav.home.href)} /> : null}
              {nav.groups.map((group) => (
                <div key={group.bucket}>
                  <p
                    className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: currentBucket === group.bucket ? "var(--color-accent)" : "var(--text-faint)" }}
                    lang={lang}
                  >
                    {t(BUCKET_LABEL[group.bucket])}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                      <li key={item.href}>
                        <SideLink item={item} active={isActivePath(pathname, item.href)} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>
        ) : null}

        <main className={cn("min-w-0 flex-1 py-5 sm:py-7", hasNav && "pb-24 md:pb-7")}>{children}</main>
      </div>

      {hasNav ? (
        <>
          <nav
            className="no-print fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
            style={{ background: "var(--surface-solid)", borderColor: "var(--hairline)" }}
            aria-label={t("nav.sections")}
          >
            <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
              {nav.home ? (
                <li className="flex-1">
                  <Link
                    to={nav.home.href}
                    lang={lang}
                    className="tap-target flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium"
                    style={{ color: isActivePath(pathname, nav.home.href) ? "var(--color-accent)" : "var(--text-muted)" }}
                  >
                    <LayoutDashboard className="h-5 w-5" aria-hidden />
                    {t("nav.dashboard")}
                  </Link>
                </li>
              ) : null}
              {nav.groups.map((group) => {
                const active = currentBucket === group.bucket;
                const color = active ? "var(--color-accent)" : "var(--text-muted)";
                const single = group.items.length === 1 ? group.items[0] : null;
                const label = t(BUCKET_LABEL[group.bucket]);
                const body = (
                  <>
                    <Menu className="h-5 w-5" aria-hidden />
                    <span className="max-w-full truncate px-1">{label}</span>
                  </>
                );
                return (
                  <li key={group.bucket} className="flex-1">
                    {single ? (
                      <Link
                        to={single.href}
                        lang={lang}
                        className="tap-target flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium"
                        style={{ color }}
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        lang={lang}
                        onClick={() => setOpenBucket(group)}
                        className="tap-target flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium"
                        style={{ color }}
                        aria-haspopup="dialog"
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          <Sheet open={openBucket !== null} onOpenChange={(open) => (!open ? setOpenBucket(null) : null)}>
            <SheetContent side="bottom" className="no-print rounded-t-2xl pb-8">
              <SheetHeader>
                <SheetTitle lang={lang} style={{ background: "transparent" }}>
                  {openBucket ? t(BUCKET_LABEL[openBucket.bucket]) : ""}
                </SheetTitle>
              </SheetHeader>
              <ul className="mt-3 grid gap-1">
                {openBucket?.items.map((item) => (
                  <li key={item.href}>
                    <SideLink item={item} active={isActivePath(pathname, item.href)} onNavigate={() => setOpenBucket(null)} />
                  </li>
                ))}
              </ul>
            </SheetContent>
          </Sheet>
        </>
      ) : null}
    </div>
  );
}

function SideLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const { t, lang } = useLang();
  return (
    <Link
      to={item.href}
      lang={lang}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "tap-target flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium",
        active ? "text-white" : "",
      )}
      style={active ? { background: "var(--color-accent)" } : { color: "var(--text-muted)" }}
    >
      {t(item.key)}
    </Link>
  );
}
