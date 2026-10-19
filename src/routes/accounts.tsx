import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Banknote, Landmark, Receipt, Users, Wallet } from "lucide-react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { CashDrawerCard } from "@/components/dashboard/cash-drawer-card";
import { useLang } from "@/lib/i18n/provider";
import { formatBDT } from "@/lib/format";
import { GlassCard, Muted } from "@/components/ui/glass";
import { getCashPosition, getCreditParties, getExpenses } from "@/lib/data/money";
import { getBankDeposits } from "@/lib/data/bank";
import { moneyStr, sum } from "@/lib/calc/decimal";

export const Route = createFileRoute("/accounts")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Account Manager — J.H.M. Filling Station" },
    { name: "description", content: "Cash, dues, bank statement, expenses and petty cash at a glance." },
    { property: "og:title", content: "Account Manager — J.H.M. Filling Station" },
    { property: "og:description", content: "Cash, dues, bank statement, expenses and petty cash at a glance." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return <Authed path="/accounts" roles={["accountant", "admin"]}>{() => <Loaded />}</Authed>;
}

interface Figures { cash: string; due: string; banked: string; expenses: string; petty: string }

function Loaded() {
  const { lang } = useLang();
  const bn = lang === "bn";
  const refreshKey = useRefreshKey();
  const [f, setF] = useState<Figures | null>(null);
  useEffect(() => {
    Promise.all([getCashPosition(1), getCreditParties(), getBankDeposits(), getExpenses()]).then(([cash, parties, bank, exp]) => {
      const today = exp.totals.day;
      const allToday = moneyStr(sum(Object.entries(today).filter(([g]) => g !== "chairman" && g !== "own_use").map(([, v]) => v)));
      const petty = exp.rows.filter((r) => r.categoryName === "Petty Cash");
      const startDay = new Date(); startDay.setHours(10, 0, 0, 0);
      if (new Date().getHours() < 10) startDay.setDate(startDay.getDate() - 1);
      setF({
        cash: cash.inHand ?? "0",
        due: moneyStr(sum(parties.map((p: any) => p.balance ?? "0"))),
        banked: bank.balance,
        expenses: allToday,
        petty: moneyStr(sum(petty.filter((r) => new Date(r.spentAt) >= startDay).map((r) => r.amount))),
      });
    });
  }, [refreshKey]);

  const tiles = [
    { to: "/cash", icon: Banknote, en: "Cash", bnL: "নগদ", en2: "Cash in hand", bn2: "হাতে নগদ", v: f?.cash },
    { to: "/dues", icon: Users, en: "Dues", bnL: "বাকি", en2: "Total due", bn2: "মোট বাকি", v: f?.due },
    { to: "/bank-deposits", icon: Landmark, en: "Bank statement", bnL: "ব্যাংক স্টেটমেন্ট", en2: "Bank balance", bn2: "ব্যাংক ব্যালান্স", v: f?.banked },
    { to: "/expenses", icon: Receipt, en: "Expenses", bnL: "খরচ", en2: "Today", bn2: "আজ", v: f?.expenses },
    { to: "/petty-cash", icon: Wallet, en: "Petty cash", bnL: "পেটি ক্যাশ", en2: "Today", bn2: "আজ", v: f?.petty },
  ] as const;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">{bn ? "অ্যাকাউন্ট ম্যানেজার" : "Account Manager"}</h1>
      <CashDrawerCard />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="block">
            <GlassCard className="h-full">
              <t.icon className="h-6 w-6 text-primary" aria-hidden />
              <p className="mt-2 font-semibold">{bn ? t.bnL : t.en}</p>
              <Muted>{bn ? t.bn2 : t.en2}</Muted>
              <p className="tabular mt-1 break-words text-lg font-semibold sm:text-2xl">{f ? formatBDT(t.v ?? "0", lang) : "…"}</p>
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
