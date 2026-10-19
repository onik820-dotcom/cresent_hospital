import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { MdDashboard } from "@/components/md-dashboard";
import { getTankOverview, type TankOverview } from "@/lib/data/overview";
import { getDashboardKpis, type DashboardKpis } from "@/lib/data/dashboard";

export const Route = createFileRoute("/md")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Managing Director — J.H.M. Filling Station" },
    { name: "description", content: "Read-only live view of sales, stock and profit." },
    { property: "og:title", content: "Managing Director — J.H.M. Filling Station" },
    { property: "og:description", content: "Read-only live view of sales, stock and profit." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return (
    <Authed path="/md" roles={["md"]}>
      {() => <Loaded />}
    </Authed>
  );
}

function Loaded() {
  const [data, setData] = useState<{ tanks: TankOverview[]; kpis: DashboardKpis | null } | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    Promise.all([getTankOverview(), getDashboardKpis()]).then(([tanks, kpis]) => setData({ tanks, kpis }));
  }, [refreshKey]);
  if (!data) return null;
  return <MdDashboard tanks={data.tanks} kpis={data.kpis} />;
}
