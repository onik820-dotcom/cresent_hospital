import * as React from "react";
import {
  Link as TanLink,
  useNavigate,
  useRouter as useTanRouter,
  useRouterState,
} from "@tanstack/react-router";
import { signalRefresh } from "@/lib/refresh";

/**
 * Compatibility shims so screens ported from the original Next.js app keep
 * their shape. New code should use TanStack Router directly.
 */

export function useRouter() {
  const navigate = useNavigate();
  const router = useTanRouter();
  return React.useMemo(
    () => ({
      push: (href: string) => navigate({ to: href }),
      replace: (href: string) => navigate({ to: href, replace: true }),
      refresh: () => {
        // Loaders and the client-side screens both need telling.
        void router.invalidate();
        signalRefresh();
      },
      back: () => router.history.back(),
    }),
    [navigate, router],
  );
}

export function usePathname(): string {
  return useRouterState({ select: (s) => s.location.pathname });
}

type LinkProps = Omit<React.ComponentProps<typeof TanLink>, "to"> & { href: string };

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, ...props },
  ref,
) {
  return <TanLink ref={ref} to={href} {...props} />;
});
