import { AdminDelete } from '@/components/admin-delete';
import { AdminEdit } from '@/components/admin-edit';
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Minus } from "lucide-react";
import { useRefreshKey, signalRefresh } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { getExpenseCategories, getExpenses, type ExpenseCategory, type ExpenseRow } from "@/lib/data/money";
import { recordExpense } from "@/components/expenses-actions";
import { useLang } from "@/lib/i18n/provider";
import { formatBDT, formatDate, businessDate } from "@/lib/format";
import { EmptyState, GlassCard, Muted } from "@/components/ui/glass";
import { FormWindow } from "@/components/ui/form-window";
import { Button } from "@/components/jhm/button";
import { moneyStr, sum } from "@/lib/calc/decimal";

export const Route = createFileRoute("/petty-cash")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Petty Cash — J.H.M. Filling Station" },
    { name: "description", content: "Petty cash in and out records." },
    { property: "og:title", content: "Petty Cash — J.H.M. Filling Station" },
    { property: "og:description", content: "Petty cash in and out records." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return <Authed path="/petty-cash" roles={["admin", "accountant"]}>{() => <Loaded />}</Authed>;
}

type Period = "day" | "month" | "year" | "all";
type Row = ExpenseRow & { dir: "in" | "out" };
const FIELD = "tap-target w-full rounded-xl border bg-transparent px-3 py-2 text-sm outline-none";

function Loaded() {
  const { lang } = useLang();
  const bn = lang === "bn";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [heads, setHeads] = useState<ExpenseCategory[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [open, setOpen] = useState(false);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    Promise.all([getExpenses(), getExpenseCategories()]).then(([b, cats]) => {
      const ins: Row[] = b.pettyIn.map((r) => ({ ...r, dir: "in" }));
      const outs: Row[] = b.pettyOut.map((r) => ({ ...r, dir: "out" }));
      setRows([...ins, ...outs].sort((a, c) => c.spentAt.localeCompare(a.spentAt)));
      setHeads(cats.filter((c) => c.group !== "own_use" && c.name !== "Petty Cash" && c.name !== "Lubricant Own Use"));
    });
  }, [refreshKey]);
  const shown = useMemo(() => {
    if (!rows) return [];
    const today = businessDate();
    return rows.filter((r) => {
      const d = businessDate(new Date(r.spentAt));
      if (period === "day") return d === today;
      if (period === "month") return d.slice(0, 7) === today.slice(0, 7);
      if (period === "year") return d.slice(0, 4) === today.slice(0, 4);
      return true;
    });
  }, [rows, period]);
  if (!rows) return null;
  const tIn = moneyStr(sum(shown.filter((r) => r.dir === "in").map((r) => r.amount)));
  const tOut = moneyStr(sum(shown.filter((r) => r.dir === "out").map((r) => r.amount)));
  const balance = moneyStr(sum([...rows.filter((r) => r.dir === "in").map((r) => r.amount), ...rows.filter((r) => r.dir === "out").map((r) => "-" + r.amount)]));
  const labels: Record<Period, string> = bn
    ? { day: "আজ", month: "এ মাস", year: "এ বছর", all: "সব" }
    : { day: "Today", month: "Month", year: "Year", all: "All" };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h1 className="text-xl font-semibold tracking-tight">{bn ? "পেটি ক্যাশ" : "Petty cash"}</h1>
        <div className="ml-auto flex gap-1">
          {(["day", "month", "year", "all"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setPeriod(k)} className="tap-target rounded-lg px-3 py-1.5 text-xs font-medium"
              style={period === k ? { background: "var(--color-accent)", color: "white" } : { color: "var(--text-muted)" }}>{labels[k]}</button>
          ))}
        </div>
        <Button onClick={() => setOpen(true)}><Minus className="h-4 w-4" aria-hidden />{bn ? "ক্যাশ আউট" : "Cash out"}</Button>
        <button type="button" onClick={() => window.print()} className="tap-target rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: "var(--hairline)" }}>
          {bn ? "প্রিন্ট" : "Print"}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <GlassCard lift={false}>
          <Muted>{bn ? `ক্যাশ ইন (${labels[period]})` : `Cash in (${labels[period]})`}</Muted>
          <p className="tabular text-2xl font-semibold state-ok">{formatBDT(tIn, lang)}</p>
        </GlassCard>
        <GlassCard lift={false}>
          <Muted>{bn ? `ক্যাশ আউট (${labels[period]})` : `Cash out (${labels[period]})`}</Muted>
          <p className="tabular text-2xl font-semibold state-breach">{formatBDT(tOut, lang)}</p>
        </GlassCard>
        <GlassCard lift={false}>
          <Muted>{bn ? "বাক্সে আছে" : "Balance in box"}</Muted>
          <p className="tabular text-2xl font-semibold">{formatBDT(balance, lang)}</p>
        </GlassCard>
      </div>
      <GlassCard lift={false}>
        {shown.length === 0 ? <EmptyState title={bn ? "কোনো রেকর্ড নেই" : "No petty cash records"} hint={bn ? "খরচ পাতার পেটি ক্যাশ বোতাম দিয়ে ক্যাশ ইন যোগ করুন" : "Cash in is added with the Petty cash button on the Expenses page."} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-2">{bn ? "তারিখ" : "Date"}</th>
                <th className="px-2 py-2">{bn ? "খাত / বিবরণ" : "Head / note"}</th>
                <th className="px-2 py-2 text-right">{bn ? "ইন" : "In"}</th>
                <th className="px-2 py-2 text-right">{bn ? "আউট" : "Out"}</th>
              </tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                    <td className="tabular whitespace-nowrap px-2 py-2">{formatDate(r.spentAt, lang)}</td>
                    <td className="px-2 py-2">
                      {r.dir === "out" ? <span className="font-medium">{(bn && r.categoryNameBn) || r.categoryName}</span> : null}
                      {r.dir === "out" && (r.description || r.descriptionBn) ? " — " : null}
                      {(bn && r.descriptionBn) || r.description || (r.dir === "in" ? (bn ? "ক্যাশ ইন" : "Cash in") : "")}
                    </td>
                    <td className="tabular px-2 py-2 text-right font-medium state-ok">{r.dir === "in" ? formatBDT(r.amount, lang) : ""}</td>
                    <td className="tabular px-2 py-2 text-right font-medium state-breach">{r.dir === "out" ? formatBDT(r.amount, lang) : ""}</td>
                    <td className="w-16 whitespace-nowrap px-1"><AdminEdit table="expenses" id={r.id} /><AdminDelete table="expenses" id={r.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
      {open ? <CashOut heads={heads} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function CashOut({ heads, onClose }: { heads: ExpenseCategory[]; onClose: () => void }) {
  const { lang } = useLang();
  const bn = lang === "bn";
  const [head, setHead] = useState(heads[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await recordExpense({ category_id: head, amount, description: note, paid_by: "petty" });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "Error");
    signalRefresh();
    onClose();
  }
  return (
    <FormWindow title={bn ? "পেটি ক্যাশ থেকে খরচ" : "Cash out of petty cash"} onClose={onClose}>
      <div className="space-y-3">
        <select value={head} onChange={(e) => setHead(e.target.value)} className={FIELD} style={{ borderColor: "var(--hairline)" }}>
          {heads.length === 0 ? <option value="">{bn ? "সেটিংসে খরচের খাত যোগ করুন" : "Add expense heads in Settings"}</option> : null}
          {heads.map((h) => <option key={h.id} value={h.id}>{(bn && h.nameBn) || h.name}</option>)}
        </select>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={bn ? "টাকা" : "Amount (৳)"} className={FIELD} style={{ borderColor: "var(--hairline)" }} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={bn ? "বিবরণ (ঐচ্ছিক)" : "Note (optional)"} className={FIELD} style={{ borderColor: "var(--hairline)" }} />
        {err ? <p className="state-breach text-sm">{err}</p> : null}
        <Button onClick={save} disabled={busy || !head}>{bn ? "সংরক্ষণ" : "Save"}</Button>
      </div>
    </FormWindow>
  );
}
