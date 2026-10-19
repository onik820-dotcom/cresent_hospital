import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { ReportsScreen } from "@/components/reports-screen";
import { businessDate } from "@/lib/format";
import { reportById, reportsForRole, visibleColumns } from "@/lib/reports/registry";
import { runReport } from "@/lib/reports/run";

export const Route = createFileRoute("/reports")({
  ssr: false,
  component: Page,
  validateSearch: (s: Record<string, unknown>): { r?: string; from?: string; to?: string } => ({
    r: typeof s.r === "string" ? s.r : undefined,
    from: typeof s.from === "string" ? s.from : undefined,
    to: typeof s.to === "string" ? s.to : undefined,
  }),
  head: () => ({ meta: [
    { title: "Reports — J.H.M. Filling Station" },
    { name: "description", content: "Daily sheet and station reports." },
    { property: "og:title", content: "Reports — J.H.M. Filling Station" },
    { property: "og:description", content: "Daily sheet and station reports." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function monthStart(d: string) {
  return `${d.slice(0, 7)}-01`;
}

function Page() {
  const params = Route.useSearch();
  return (
    <Authed path="/reports" roles={["admin", "md"]}>
      {(p) => <Loaded role={p.role} r={params.r} from={params.from} to={params.to} />}
    </Authed>
  );
}

type ReportResult = Awaited<ReturnType<typeof runReport>>;

function Loaded({ role, r, from: fromParam, to: toParam }: { role: "manager" | "admin" | "md" | "dispenser" | "accountant"; r?: string; from?: string; to?: string }) {
  const [result, setResult] = useState<ReportResult | null>(null);
  const available = reportsForRole(role);
  const today = businessDate();
  const requested = r ?? available[0]?.id ?? "daily-sheet";
  const report = reportById(requested);
  const id = report && report.roles.includes(role) ? requested : (available[0]?.id ?? "daily-sheet");
  const chosen = reportById(id)!;
  const to = toParam ?? today;
  const from = chosen.period === "day" ? to : (fromParam ?? monthStart(to));
  const canSeeCost = role === "admin" || role === "md";

  const refreshKey = useRefreshKey();
  useEffect(() => {
    setResult(null);
    runReport(id, from, to, canSeeCost)
      .then(setResult)
      .catch((e: unknown) =>
        setResult({
          report: chosen,
          rows: [],
          totals: {},
          from,
          to,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
  }, [id, from, to, canSeeCost, refreshKey]);

  if (!result) return null;
  return (
    <ReportsScreen
      available={available.map((x) => ({
        id: x.id,
        en: x.en,
        bn: x.bn,
        descriptionEn: x.descriptionEn,
        descriptionBn: x.descriptionBn,
        period: x.period,
        layout: x.layout ?? null,
      }))}
      reportId={id}
      columns={visibleColumns(chosen, canSeeCost)}
      rows={result.rows}
      totals={result.totals}
      sections={result.sections ?? null}
      sheet={result.sheet ?? null}
      statement={result.statement ?? null}
      error={result.error ?? null}
      from={from}
      to={to}
      period={chosen.period}
    />
  );
}
