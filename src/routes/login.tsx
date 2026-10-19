import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Fuel, LoaderCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n/provider";
import { GlassCard, Muted } from "@/components/ui/glass";
import { Button } from "@/components/jhm/button";
import { LanguageToggle } from "@/components/language-toggle";
import { FirstRunNotice } from "@/components/first-run-notice";
import { getSessionProfile } from "@/lib/session";
import { ROLE_HOME } from "@/lib/roles";

export const Route = createFileRoute("/login")({
  ssr: false,
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>): { next?: string; error?: string } => ({
    next: typeof search.next === "string" ? search.next : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — J.H.M. Filling Station" },
      { name: "description", content: "Sign in to the J.H.M. Filling Station operations system." },
      { property: "og:title", content: "Sign in — J.H.M. Filling Station" },
      { property: "og:description", content: "Sign in to the J.H.M. Filling Station operations system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function LoginPage() {
  const { next, error: errorCode } = Route.useSearch();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    errorCode === "no-profile" ? t("auth.noProfile") : null,
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(t("auth.failed"));
      setPending(false);
      return;
    }

    const profile = await getSessionProfile();
    if (!profile) {
      setError(t("auth.noProfile"));
      setPending(false);
      return;
    }

    navigate({ to: next && next.startsWith("/") ? next : ROLE_HOME[profile.role] });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <FirstRunNotice />
      <GlassCard className="w-full max-w-sm p-6 sm:p-8" lift={false}>
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <div
              className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
            >
              <Fuel className="h-5 w-5" aria-hidden />
            </div>
            <h1 className="text-lg font-semibold tracking-tight" lang={lang}>
              {t("app.name")}
            </h1>
            <Muted lang={lang}>{t("app.tagline")}</Muted>
          </div>
          <LanguageToggle />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-xs font-medium" style={{ color: "var(--text-muted)" }} lang={lang}>
              {t("auth.email")}
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="tap-target w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: "var(--hairline)" }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-xs font-medium" style={{ color: "var(--text-muted)" }} lang={lang}>
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="tap-target w-full rounded-xl border bg-transparent px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: "var(--hairline)" }}
            />
          </div>

          {error ? (
            <p className="state-breach text-xs" role="alert" lang={lang}>
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="w-full" disabled={pending} lang={lang}>
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {pending ? t("auth.signingIn") : t("auth.signIn")}
          </Button>
        </form>
      </GlassCard>
    </main>
  );
}
