import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { CloseScreen } from "@/components/shift-close-screen";
import { ClosedConfirmation, type ClosedInfo } from "@/components/shift/close-wizard";
import { getCloseContext } from "@/lib/data/shift-close";

export const Route = createFileRoute("/shift/close")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { edit?: string; step?: number } => {
    const step = Number(s.step);
    return {
      edit: typeof s.edit === "string" ? s.edit : undefined,
      // 1-based position of the wizard step to open on (the dashboard's "Add expense" opens step 4).
      step: Number.isInteger(step) && step >= 1 && step <= 6 ? step : undefined,
    };
  },
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
  const { edit, step } = Route.useSearch();
  const [context, setContext] = useState<Awaited<ReturnType<typeof getCloseContext>> | null>(null);
  const refreshKey = useRefreshKey();
  // Kept here, above the screen: once the shift is closed the wizard is replaced
  // by "no shift is open", and the confirmation must survive that.
  const [closedInfo, setClosedInfo] = useState<ClosedInfo | null>(null);
  useEffect(() => { getCloseContext(edit).then(setContext); }, [refreshKey, edit]);
  if (closedInfo) return <ClosedConfirmation shiftId={closedInfo.shiftId} signerName={closedInfo.signerName} />;
  if (!context) return null;
  return <CloseScreen key={context.shift?.id ?? "none"} context={context} initialStep={step ? step - 1 : 0} onClosed={setClosedInfo} />;
}
