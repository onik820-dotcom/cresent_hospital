import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getDispenserOverview, getTankOverview, type DispenserOverview, type TankOverview } from "@/lib/data/overview";
import { getDashboardKpis, type DashboardKpis } from "@/lib/data/dashboard";

export const Route = createFileRoute("/admin")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Accounts & owner — J.H.M. Filling Station" },
    { name: "description", content: "Owner dashboard: sales, stock, dues and equipment." },
    { property: "og:title", content: "Accounts & owner — J.H.M. Filling Station" },
    { property: "og:description", content: "Owner dashboard: sales, stock, dues and equipment." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return (
    <Authed path="/admin" roles={["admin"]}>
      {() => <Loaded />}
    </Authed>
  );
}

function Loaded() {
  const [data, setData] = useState<{ tanks: TankOverview[]; dispensers: DispenserOverview[]; kpis: DashboardKpis | null } | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    Promise.all([getTankOverview(), getDispenserOverview(), getDashboardKpis()]).then(([tanks, dispensers, kpis]) =>
      setData({ tanks, dispensers, kpis }),
    );
  }, [refreshKey]);
  if (!data) return null;
  return <AdminDashboard tanks={data.tanks} dispensers={data.dispensers} kpis={data.kpis} />;
}
