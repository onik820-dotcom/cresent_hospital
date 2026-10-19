import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { CashScreen } from "@/components/cash-screen";
import { getCashPosition } from "@/lib/data/money";
import { getDieselSales, type DieselSaleRow } from "@/lib/data/diesel-sales";

export const Route = createFileRoute("/cash")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Cash — J.H.M. Filling Station" },
    { name: "description", content: "Drawer balance, deposits and hand-overs." },
    { property: "og:title", content: "Cash — J.H.M. Filling Station" },
    { property: "og:description", content: "Drawer balance, deposits and hand-overs." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return <Authed path="/cash" roles={["admin", "accountant"]}>{() => <Loaded />}</Authed>;
}

function Loaded() {
  const [position, setPosition] = useState<Awaited<ReturnType<typeof getCashPosition>> | null>(null);
  const [sales, setSales] = useState<DieselSaleRow[]>([]);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    getCashPosition().then(setPosition);
    getDieselSales().then(setSales);
  }, [refreshKey]);
  if (!position) return null;
  return <CashScreen position={position} dieselSales={sales} />;
}
