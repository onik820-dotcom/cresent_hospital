import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { BankScreen } from "@/components/bank-screen";
import { getBankDeposits } from "@/lib/data/bank";

export const Route = createFileRoute("/bank-deposits")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "Bank statement — J.H.M. Filling Station" },
    { name: "description", content: "Bank credits, debits and running balance." },
    { property: "og:title", content: "Bank statement — J.H.M. Filling Station" },
    { property: "og:description", content: "Bank credits, debits and running balance." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return <Authed path="/bank-deposits" roles={["admin", "accountant"]}>{(p) => <Loaded isAdmin={p.role === "admin"} />}</Authed>;
}

function Loaded({ isAdmin }: { isAdmin: boolean }) {
  const [book, setBook] = useState<Awaited<ReturnType<typeof getBankDeposits>> | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    getBankDeposits().then(setBook);
  }, [refreshKey]);
  if (!book) return null;
  return <BankScreen book={book} isAdmin={isAdmin} />;
}
