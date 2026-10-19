import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Fuel, Truck } from "lucide-react";
import { useRefreshKey } from "@/lib/refresh";
import { useLang } from "@/lib/i18n/provider";
import { formatLitres } from "@/lib/format";
import { Authed } from "@/components/authed";
import { GlassCard, Muted } from "@/components/ui/glass";
import { DeliveryForm } from "@/components/refill/delivery-form";
import { OilPurchaseSheet } from "@/components/refill/oil-purchase-sheet";
import { getRefillTanks, type RefillTank } from "@/lib/data/refill";
import { getPurchasedOilLitres } from "@/lib/data/purchased-oil";

export const Route = createFileRoute("/oil-purchase")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Oil purchase — J.H.M. Filling Station" },
    { name: "description", content: "Record diesel bought by the truck load into stock." },
    { property: "og:title", content: "Oil purchase — J.H.M. Filling Station" },
    { property: "og:description", content: "Record diesel bought by the truck load into stock." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return (
    <Authed path="/oil-purchase" roles={["manager", "admin"]}>
      {(p) => <Loaded canSeeCost={p.role === "admin"} />}
    </Authed>
  );
}

function Loaded({ canSeeCost }: { canSeeCost: boolean }) {
  const { lang } = useLang();
  const [tanks, setTanks] = useState<RefillTank[] | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    getRefillTanks().then(setTanks);
    getPurchasedOilLitres().then(setLeft);
  }, [refreshKey]);
  if (!tanks) return null;
  const truck = tanks.find((t) => t.code === "TRUCK");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Fuel className="h-5 w-5" style={{ color: "var(--color-accent)" }} aria-hidden />
        <h1 className="text-lg font-semibold tracking-tight" lang={lang}>
          {lang === "bn" ? "তেল ক্রয়" : "Oil purchase"}
        </h1>
      </div>
      <Muted lang={lang}>
        {lang === "bn"
          ? "কেনা তেল মজুদে ‘কেনা তেল’ হিসেবে যোগ হয়। ট্যাংকে রিফিল করলে একই তেল ট্যাংক ১ বা ট্যাংক ২-এ যায় — নতুন করে মজুদে যোগ হয় না। ডিপো রেট শুধু তেলের ক্রয়মূল্য হিসাবে ব্যবহৃত হয় — ক্রয়ের টাকা ক্যাশ, ব্যাংক বা খরচ থেকে কাটা হয় না।"
          : "Bought oil is added to stock as purchased oil. A tank refill moves that same oil into Tank 1 or Tank 2 — it is never added to stock again. The depot rate is used only to value the oil — the purchase payment is never taken from cash, bank or expenses."}
      </Muted>
      {truck ? (
        <GlassCard lift={false} className="flex items-center gap-2 py-2.5">
          <Truck className="h-4 w-4" aria-hidden />
          <span className="text-sm font-semibold" lang={lang}>{lang === "bn" ? "কেনা তেল মজুদ" : "Purchased oil in stock"}</span>
          <span className="tabular ml-auto text-sm font-semibold">
            {formatLitres(left !== null ? String(left) : (truck.currentLitres ?? "0"), lang)}
          </span>
        </GlassCard>
      ) : null}
      <div className="no-print">
        <DeliveryForm tanks={tanks} canSeeCost={canSeeCost} mode="quantity" />
      </div>
      <OilPurchaseSheet canSeeCost={canSeeCost} />
    </div>
  );
}
