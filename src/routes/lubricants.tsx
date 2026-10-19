import { createFileRoute } from "@tanstack/react-router";
import { businessDate } from "@/lib/format";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { LubricantsScreen } from "@/components/lubricants-screen";
import { getLubMovements, getLubSkus, summariseMovements } from "@/lib/data/lubricants";
import { getCreditParties } from "@/lib/data/money";

export const Route = createFileRoute("/lubricants")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Lubricants — J.H.M. Filling Station" },
    { name: "description", content: "Lubricant stock and sales." },
    { property: "og:title", content: "Lubricants — J.H.M. Filling Station" },
    { property: "og:description", content: "Lubricant stock and sales." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return (
    <Authed path="/lubricants" roles={["admin"]}>
      {(p) => <Loaded canSeeCost={p.role === "admin"} />}
    </Authed>
  );
}

function Loaded({ canSeeCost }: { canSeeCost: boolean }) {
  const [data, setData] = useState<{
    skus: Awaited<ReturnType<typeof getLubSkus>>;
    movements: Awaited<ReturnType<typeof getLubMovements>>;
    parties: { id: string; name: string; balance: string }[];
  } | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    Promise.all([getLubSkus(canSeeCost), getLubMovements(), getCreditParties()]).then(([skus, movements, parties]) =>
      setData({
        skus,
        movements,
        parties: parties
          .filter((x) => x.isActive)
          .map((x) => ({ id: x.id, name: x.name, balance: x.balance })),
      }),
    );
  }, [canSeeCost, refreshKey]);
  if (!data) return null;
  // Business day runs 10:00 Dhaka to 10:00 next day.
  const now = new Date();
  const dayStart = new Date(`${businessDate(now)}T10:00:00+06:00`);
  const summary = summariseMovements(data.movements, dayStart);
  return <LubricantsScreen skus={data.skus} movements={data.movements} summary={summary} parties={data.parties} canSeeCost={canSeeCost} />;
}
