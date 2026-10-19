import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRefreshKey } from "@/lib/refresh";
import { Authed } from "@/components/authed";
import { PeopleBoard } from "@/components/people-board";
import { getInvitations, getPeople } from "@/lib/data/people";

export const Route = createFileRoute("/people")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "People — J.H.M. Filling Station" },
    { name: "description", content: "Accounts, roles and invitations." },
    { property: "og:title", content: "People — J.H.M. Filling Station" },
    { property: "og:description", content: "Accounts, roles and invitations." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return (
    <Authed path="/people" roles={["admin"]}>
      {(p) => <Loaded meId={p.id} />}
    </Authed>
  );
}

function Loaded({ meId }: { meId: string }) {
  const [data, setData] = useState<{ people: Awaited<ReturnType<typeof getPeople>>; invitations: Awaited<ReturnType<typeof getInvitations>> } | null>(null);
  const refreshKey = useRefreshKey();
  useEffect(() => {
    Promise.all([getPeople(), getInvitations()]).then(([people, invitations]) => setData({ people, invitations: invitations.filter((i) => i.status === 'pending' || people.some((p) => p.email.toLowerCase() === i.email.toLowerCase())) }));
  }, [refreshKey]);
  if (!data) return null;
  return <PeopleBoard people={data.people} invitations={data.invitations} meId={meId} />;
}
