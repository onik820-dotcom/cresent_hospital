import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { DispenserScreenImpl } from "@/components/dispenser-screen-impl";
import { getCurrentShift, getMySubmissionCount, type CurrentShift } from "@/lib/data/overview";

export const Route = createFileRoute("/dispenser/")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Forecourt — J.H.M. Filling Station" },
    { name: "description", content: "Meter readings and tank dips for the forecourt." },
    { property: "og:title", content: "Forecourt — J.H.M. Filling Station" },
    { property: "og:description", content: "Meter readings and tank dips for the forecourt." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return (
    <Authed path="/dispenser" roles={["dispenser"]} bare>
      {(profile) => <Loaded fullName={profile.fullNameBn ?? profile.fullName} />}
    </Authed>
  );
}

function Loaded({ fullName }: { fullName: string }) {
  const [data, setData] = useState<{ shift: CurrentShift | null; submitted: number } | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    getCurrentShift().then(async (shift) => {
      const counts = await getMySubmissionCount(shift?.id ?? null);
      setData({ shift, submitted: counts.readings + counts.dips });
    });
  }, [refreshKey]);
  if (!data) return null;
  return <DispenserScreenImpl fullName={fullName} shift={data.shift} submitted={data.submitted} />;
}
