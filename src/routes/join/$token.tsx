import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Fuel, LoaderCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n/provider";
import { GlassCard, Chip, Muted } from "@/components/ui/glass";
import { Button } from "@/components/jhm/button";
import { LanguageToggle } from "@/components/language-toggle";
import type { Role } from "@/lib/roles";

export const Route = createFileRoute("/join/$token")({
  ssr: false,
  component: JoinPage,
  head: () => ({
    meta: [
      { title: "Join the station — J.H.M. Filling Station" },
      { name: "description", content: "Accept an invitation to the J.H.M. Filling Station operations system." },
      { property: "og:title", content: "Join the station — J.H.M. Filling Station" },
      { property: "og:description", content: "Accept an invitation to the J.H.M. Filling Station operations system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Preview {
  email: string;
  role: Role;
  full_name: string;
  expires_at: string;
}

const ROLE_KEY = {
  dispenser: "role.dispenser",
  manager: "role.manager",
  admin: "role.admin",
  md: "role.md",
  accountant: "role.accountant",
} as const;

const FIELD = "tap-target w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none";

function JoinPage() {
  const { token } = Route.useParams();
  const { t, lang } = useLang();
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);

  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("invitation_preview", { p_token: token })
      .then(({ data }) => {
        if (cancelled) return;
        setInvitation(((data ?? []) as Preview[])[0] ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError(t("join.tooShort"));
      return;
    }
    if (password !== repeat) {
      setError(t("join.mismatch"));
      return;
    }

    setPending(true);

    const { error: rpcError } = await supabase.rpc("accept_invitation", {
      p_token: token,
      p_password: password,
      p_phone: phone || undefined,
    });

    if (rpcError) {
      setError(rpcError.message);
      setPending(false);
      return;
    }

    setDone(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: invitation!.email,
      password,
    });
    if (signInError) {
      navigate({ to: "/login" });
      return;
    }

    navigate({ to: "/" });
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <GlassCard className="w-full max-w-sm p-6 sm:p-8" lift={false}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }} lang={lang}>
            {t("common.loading")}
          </p>
        </GlassCard>
      </main>
    );
  }

  if (!invitation) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-10">
        <GlassCard className="w-full max-w-sm p-6 sm:p-8" lift={false}>
          <div className="mb-6 flex items-start justify-between gap-3">
            <div
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
            >
              <Fuel className="h-5 w-5" aria-hidden />
            </div>
            <LanguageToggle />
          </div>
          <h1 className="text-lg font-semibold tracking-tight" lang={lang}>
            {t("join.title")}
          </h1>
          <p className="state-breach mt-3 text-sm" role="alert" lang={lang}>
            {t("join.invalid")}
          </p>
          <Muted className="mt-2" lang={lang}>
            {t("join.invalidHint")}
          </Muted>
          <Link
            to="/login"
            className="tap-target mt-5 inline-flex items-center text-xs font-medium"
            style={{ color: "var(--color-accent)" }}
            lang={lang}
          >
            {t("auth.signIn")}
          </Link>
        </GlassCard>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <GlassCard className="w-full max-w-sm p-6 sm:p-8" lift={false}>
        <div className="mb-6 flex items-start justify-between gap-3">
          <div
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
          >
            <Fuel className="h-5 w-5" aria-hidden />
          </div>
          <LanguageToggle />
        </div>

        <h1 className="text-lg font-semibold tracking-tight" lang={lang}>
          {t("join.title")}
        </h1>
        <Muted className="mt-1" lang={lang}>
          {t("app.name")}
        </Muted>

        <div className="mt-4 rounded-xl p-3" style={{ background: "var(--color-accent-soft)" }}>
          <p className="text-sm font-medium">{invitation.full_name}</p>
          <Muted className="truncate">{invitation.email}</Muted>
          <Chip className="mt-2" lang={lang}>
            {t(ROLE_KEY[invitation.role])}
          </Chip>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="join-password" className="text-xs font-medium" style={{ color: "var(--text-muted)" }} lang={lang}>
              {t("join.choosePassword")}
            </label>
            <input
              id="join-password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FIELD}
              style={{ borderColor: "var(--hairline)" }}
            />
            <Muted lang={lang}>{t("join.rules")}</Muted>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="join-repeat" className="text-xs font-medium" style={{ color: "var(--text-muted)" }} lang={lang}>
              {t("join.repeatPassword")}
            </label>
            <input
              id="join-repeat"
              type="password"
              required
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className={FIELD}
              style={{ borderColor: "var(--hairline)" }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="join-phone" className="text-xs font-medium" style={{ color: "var(--text-muted)" }} lang={lang}>
              {t("join.phone")}
            </label>
            <input
              id="join-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={FIELD}
              style={{ borderColor: "var(--hairline)" }}
            />
          </div>

          {error ? (
            <p className="state-breach text-xs" role="alert">
              {error}
            </p>
          ) : null}

          {done ? (
            <p className="state-ok text-xs" role="status" lang={lang}>
              {t("join.welcome")}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={pending} lang={lang}>
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {pending ? t("join.working") : t("join.submit")}
          </Button>
        </form>
      </GlassCard>
    </main>
  );
}
