import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSessionProfile } from "@/lib/session";
import { ROLE_HOME } from "@/lib/roles";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const profile = await getSessionProfile();
    throw redirect({ to: profile ? ROLE_HOME[profile.role] : "/login" });
  },
});
