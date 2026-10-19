import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { ExpensesScreen } from "@/components/expenses-screen";
import { getExpenseCategories, getExpenses } from "@/lib/data/money";

export const Route = createFileRoute("/expenses")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Expenses — J.H.M. Filling Station" },
    { name: "description", content: "Daily expenses and receipts." },
    { property: "og:title", content: "Expenses — J.H.M. Filling Station" },
    { property: "og:description", content: "Daily expenses and receipts." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return <Authed path="/expenses" roles={["admin", "accountant"]}>{() => <Loaded />}</Authed>;
}

function Loaded() {
  const [data, setData] = useState<{ book: Awaited<ReturnType<typeof getExpenses>>; categories: Awaited<ReturnType<typeof getExpenseCategories>> } | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    Promise.all([getExpenses(), getExpenseCategories()]).then(([book, categories]) => setData({ book, categories }));
  }, [refreshKey]);
  if (!data) return null;
  return <ExpensesScreen book={data.book} categories={data.categories} />;
}
