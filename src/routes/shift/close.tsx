import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { CloseScreen } from "@/components/shift-close-screen";
import { getCloseContext } from "@/lib/data/shift-close";

export const Route = createFileRoute("/shift/close")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { edit?: string } => ({
    edit: typeof s.edit === "string" ? s.edit : undefined,
  }),
  component: Page,
  head: () => ({ meta: [
    { title: "Close shift — J.H.M. Filling Station" },
    { name: "description", content: "Reconcile meters, dips and cash to close the shift." },
    { property: "og:title", content: "Close shift — J.H.M. Filling Station" },
    { property: "og:description", content: "Reconcile meters, dips and cash to close the shift." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return <Authed path="/shift/close" roles={["manager", "admin"]}>{() => <Loaded />}</Authed>;
}

function Loaded() {
  const { edit } = Route.useSearch();
  const [context, setContext] = useState<Awaited<ReturnType<typeof getCloseContext>> | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => { getCloseContext(edit).then(setContext); }, [refreshKey, edit]);
  if (!context) return null;
  return <CloseScreen key={context.shift?.id ?? "none"} context={context} />;
}
