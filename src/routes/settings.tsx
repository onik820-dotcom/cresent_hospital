import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { SettingsScreen } from "@/components/settings-screen";
import { getSettingsOptions, type SettingsOptions } from "@/lib/data/settings";

export const Route = createFileRoute("/settings")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Settings — J.H.M. Filling Station" },
    { name: "description", content: "Party names, lubricant products and the units they are sold in." },
    { property: "og:title", content: "Settings — J.H.M. Filling Station" },
    { property: "og:description", content: "Party names, lubricant products and the units they are sold in." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return <Authed path="/settings" roles={["admin"]}>{() => <Loaded />}</Authed>;
}

function Loaded() {
  const [options, setOptions] = useState<SettingsOptions | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    getSettingsOptions().then(setOptions);
  }, [refreshKey]);
  if (!options) return null;
  return <SettingsScreen options={options} />;
}
