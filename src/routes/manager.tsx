import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { ManagerDashboard } from "@/components/manager-dashboard";
import { getCurrentShift, getTankOverview, type CurrentShift, type TankOverview } from "@/lib/data/overview";
import { getDashboardKpis, type DashboardKpis } from "@/lib/data/dashboard";

export const Route = createFileRoute("/manager")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Manager — J.H.M. Filling Station" },
    { name: "description", content: "Shift, tanks and today's figures for the pump manager." },
    { property: "og:title", content: "Manager — J.H.M. Filling Station" },
    { property: "og:description", content: "Shift, tanks and today's figures for the pump manager." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return (
    <Authed path="/manager" roles={["manager", "admin"]}>
      {() => <Loaded />}
    </Authed>
  );
}

function Loaded() {
  const [data, setData] = useState<{ shift: CurrentShift | null; tanks: TankOverview[]; kpis: DashboardKpis | null } | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    Promise.all([getCurrentShift(), getTankOverview(), getDashboardKpis()]).then(([shift, tanks, kpis]) =>
      setData({ shift, tanks, kpis }),
    );
  }, [refreshKey]);
  if (!data) return null;
  return <ManagerDashboard shift={data.shift} tanks={data.tanks} kpis={data.kpis} />;
}
