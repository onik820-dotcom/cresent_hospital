import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { DipScreen } from "@/components/dispenser/dip-screen";
import { getCurrentShift } from "@/lib/data/overview";
import { getTankOptions, type TankOption } from "@/lib/data/dispenser";

type DipType = "close" | "pre_refill" | "post_refill";

export const Route = createFileRoute("/dispenser/dip")({
  ssr: false,
  component: Page,
  validateSearch: (s: Record<string, unknown>): { type?: DipType } => ({
    type: s.type === "pre_refill" || s.type === "post_refill" ? s.type : undefined,
  }),
  head: () => ({ meta: [
    { title: "Tank dip — J.H.M. Filling Station" },
    { name: "description", content: "Record a tank dip reading." },
    { property: "og:title", content: "Tank dip — J.H.M. Filling Station" },
    { property: "og:description", content: "Record a tank dip reading." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  const { type } = Route.useSearch();
  return (
    <Authed path="/dispenser/dip" roles={["dispenser", "manager", "admin"]} bare>
      {(profile) => <Loaded userId={profile.id} dipType={type ?? "close"} />}
    </Authed>
  );
}

function Loaded({ userId, dipType }: { userId: string; dipType: DipType }) {
  const [data, setData] = useState<{ shiftId: string | null; tanks: TankOption[] } | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    Promise.all([getCurrentShift(), getTankOptions()]).then(([shift, tanks]) =>
      setData({ shiftId: shift?.id ?? null, tanks: tanks.filter((t) => t.code !== "TRUCK") }),
    );
  }, [refreshKey]);
  if (!data) return null;
  return <DipScreen shiftId={data.shiftId} tanks={data.tanks} userId={userId} dipType={dipType} />;
}
