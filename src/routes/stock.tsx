import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { StockPage } from "@/components/stock-page";
import { getDispenserDetails, getTankDetails } from "@/lib/data/stock";

export const Route = createFileRoute("/stock")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Stock — J.H.M. Filling Station" },
    { name: "description", content: "Tanks, dispensers and calibration charts." },
    { property: "og:title", content: "Stock — J.H.M. Filling Station" },
    { property: "og:description", content: "Tanks, dispensers and calibration charts." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return (
    <Authed path="/stock" roles={["manager", "admin"]}>
      {(p) => <Loaded isAdmin={p.role === "admin"} />}
    </Authed>
  );
}

function Loaded({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<{ tanks: Awaited<ReturnType<typeof getTankDetails>>; dispensers: Awaited<ReturnType<typeof getDispenserDetails>> } | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    Promise.all([getTankDetails(), getDispenserDetails()]).then(([tanks, dispensers]) => setData({ tanks, dispensers }));
  }, [refreshKey]);
  if (!data) return null;
  return <StockPage tanks={data.tanks} dispensers={data.dispensers} isAdmin={isAdmin} />;
}
