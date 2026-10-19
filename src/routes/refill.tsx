import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { RefillScreen } from "@/components/refill-screen";
import { getDeliveries, getPurchaseRegister, getRefillTanks } from "@/lib/data/refill";
import { getDipRefills } from "@/lib/data/dip-refill";
import { getTankDetails } from "@/lib/data/stock";

export const Route = createFileRoute("/refill")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Refill — J.H.M. Filling Station" },
    { name: "description", content: "Tanker deliveries and the purchase register." },
    { property: "og:title", content: "Refill — J.H.M. Filling Station" },
    { property: "og:description", content: "Tanker deliveries and the purchase register." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return (
    <Authed path="/refill" roles={["manager", "admin"]}>
      {(p) => <Loaded canSeeCost={p.role === "admin"} />}
    </Authed>
  );
}

function Loaded({ canSeeCost }: { canSeeCost: boolean }) {
  const [data, setData] = useState<{
    tanks: Awaited<ReturnType<typeof getRefillTanks>>;
    deliveries: Awaited<ReturnType<typeof getDeliveries>>;
    register: Awaited<ReturnType<typeof getPurchaseRegister>>;
    dipRefills: Awaited<ReturnType<typeof getDipRefills>>;
    tankDetails: Awaited<ReturnType<typeof getTankDetails>>;
  } | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    Promise.all([
      getRefillTanks(),
      getDeliveries(),
      getPurchaseRegister(),
      getDipRefills({ limit: 20 }),
      getTankDetails(),
    ]).then(([tanks, deliveries, register, dipRefills, tankDetails]) => {
      // The refill page shows station tanks only; oil purchases (TRUCK) live on Oil purchase and Stock.
      const tankDeliveries = deliveries
        .map((d) => ({ ...d, compartments: d.compartments.filter((c) => c.tankCode !== "TRUCK") }))
        .filter((d) => d.compartments.length > 0);
      const byTank = register.byTank.filter((r) => r.tankCode !== "TRUCK");
      const sum = (p: "day" | "month" | "year") => {
        let litres = 0, value = 0, shortage = 0, sold = 0;
        const ids = new Set<string>();
        for (const r of byTank) {
          litres += Number(r[p].litres); value += Number(r[p].value); shortage += Number(r[p].shortage); sold += Number(r[p].sold);
        }
        const deliveriesCount = tankDeliveries.length ? Math.max(...byTank.map((r) => r[p].deliveries), 0) : 0;
        void ids;
        return { litres: litres.toFixed(3), value: value.toFixed(2), shortage: shortage.toFixed(3), sold: sold.toFixed(3), deliveries: deliveriesCount };
      };
      setData({
        tanks,
        deliveries: tankDeliveries,
        register: { byTank, overall: { day: sum("day"), month: sum("month"), year: sum("year") } },
        dipRefills,
        tankDetails,
      });
    });
  }, [refreshKey]);
  if (!data) return null;
  return <RefillScreen tanks={data.tanks} deliveries={data.deliveries} register={data.register} dipRefills={data.dipRefills} tankDetails={data.tankDetails} isAdmin={canSeeCost} canSeeCost={canSeeCost} />;
}
