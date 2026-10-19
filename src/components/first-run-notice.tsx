import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n/provider";
import { GlassCard, Muted } from "@/components/ui/glass";

/**
 * A new install has no accounts, and nobody can create the first one from
 * inside the app: accounts are made by an admin, and provision_account() is
 * deliberately closed to every signed-in role. This tells whoever opens a
 * fresh install what to do instead of leaving them at a sign-in box that can
 * never succeed.
 *
 * It asks one anonymous question — "is there an admin?" — and says nothing
 * when the answer is yes or cannot be found out.
 */
const SETUP_SQL = `select public.provision_account(
  'owner@your-station.example',        -- the owner's email
  '<a strong password, 10+ characters>',
  'admin',
  'Owner Full Name'
);`;

export function FirstRunNotice() {
  const { lang } = useLang();
  const bn = lang === "bn";
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    // `admin_exists` is added by migration 0080; before it is applied this is an
    // error, which is treated as "unknown" rather than "no admin".
    supabase.rpc("admin_exists").then(({ data, error }) => {
      if (alive && !error && data === false) setMissing(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!missing) return null;

  return (
    <GlassCard lift={false} className="mb-4 w-full max-w-xl space-y-3" role="alert">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 state-watch" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-semibold tracking-tight" lang={lang}>
            {bn
              ? "কোনো অ্যাডমিন অ্যাকাউন্ট পাওয়া যায়নি।"
              : "No admin account found. Run the setup SQL in your Supabase dashboard."}
          </p>
          <Muted lang={lang}>
            {bn
              ? "Supabase ড্যাশবোর্ডের SQL Editor-এ নিচের কমান্ডটি একবার চালান, তারপর সেই ইমেইল ও পাসওয়ার্ডে সাইন ইন করুন।"
              : "Open the SQL Editor in your Supabase dashboard, run this once, then sign in with that email and password. Everyone else is created from People inside the app."}
          </Muted>
        </div>
      </div>
      <pre
        className="overflow-x-auto rounded-xl p-3 text-[11px] leading-relaxed"
        style={{ background: "var(--hairline)" }}
        tabIndex={0}
      >
        {SETUP_SQL}
      </pre>
    </GlassCard>
  );
}
