import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { DuesScreen } from "@/components/dues-screen";
import { getDashboardKpis } from "@/lib/data/dashboard";
import { ageingTotals, getCreditParties, getRecentPayments } from "@/lib/data/money";

export const Route = createFileRoute("/dues")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Dues — J.H.M. Filling Station" },
    { name: "description", content: "Credit customers, ageing and payments." },
    { property: "og:title", content: "Dues — J.H.M. Filling Station" },
    { property: "og:description", content: "Credit customers, ageing and payments." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return (
    <Authed path="/dues" roles={["admin", "accountant"]}>
      {(p) => <Loaded isAdmin={p.role === "admin"} />}
    </Authed>
  );
}

function Loaded({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<{ parties: Awaited<ReturnType<typeof getCreditParties>>; payments: Awaited<ReturnType<typeof getRecentPayments>>; kpis: Awaited<ReturnType<typeof getDashboardKpis>> | null } | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    Promise.all([getCreditParties(), getRecentPayments(), getDashboardKpis().catch(() => null)]).then(([parties, payments, kpis]) => setData({ parties, payments, kpis }));
  }, [refreshKey]);
  if (!data) return null;
  return <DuesScreen parties={data.parties} totals={ageingTotals(data.parties)} payments={data.payments} isAdmin={isAdmin} collectedToday={data.kpis?.duesCollectedToday ?? "0"} collectedCount={data.kpis?.duesCollectedCount ?? 0} />;
}
