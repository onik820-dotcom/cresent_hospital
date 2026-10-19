import { createFileRoute } from "@tanstack/react-router";
import { Authed } from "@/components/authed";
import { AccountScreen } from "@/components/account-screen";

export const Route = createFileRoute("/account")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [
    { title: "My account — J.H.M. Filling Station" },
    { name: "description", content: "Your own name, phone, language and password for the station books." },
    { property: "og:title", content: "My account — J.H.M. Filling Station" },
    { property: "og:description", content: "Your own name, phone, language and password for the station books." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function Page() {
  return (
    <Authed path="/account" roles={["dispenser", "manager", "admin", "md", "accountant"]}>
      {() => <AccountScreen />}
    </Authed>
  );
}
