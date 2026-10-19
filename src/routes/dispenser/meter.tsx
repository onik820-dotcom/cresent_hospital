import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { MeterScreen } from "@/components/dispenser/meter-screen";
import { getCurrentShift } from "@/lib/data/overview";
import { getNozzleOptions, type NozzleOption } from "@/lib/data/dispenser";

export const Route = createFileRoute("/dispenser/meter")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Meter reading — J.H.M. Filling Station" },
    { name: "description", content: "Photograph a pump meter and confirm the reading." },
    { property: "og:title", content: "Meter reading — J.H.M. Filling Station" },
    { property: "og:description", content: "Photograph a pump meter and confirm the reading." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return (
    <Authed path="/dispenser/meter" roles={["dispenser", "manager", "admin"]} bare>
      {(profile) => <Loaded userId={profile.id} />}
    </Authed>
  );
}

function Loaded({ userId }: { userId: string }) {
  const [data, setData] = useState<{ shiftId: string | null; nozzles: NozzleOption[] } | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    Promise.all([getCurrentShift(), getNozzleOptions()]).then(([shift, nozzles]) =>
      setData({ shiftId: shift?.id ?? null, nozzles }),
    );
  }, [refreshKey]);
  if (!data) return null;
  return <MeterScreen shiftId={data.shiftId} nozzles={data.nozzles} userId={userId} />;
}
