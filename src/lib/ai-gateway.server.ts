/**
 * Lovable AI Gateway plumbing.
 *
 * The only thing that matters here is the run id: the gateway mints one per
 * request, and resending it keeps every follow-up step of a tool loop tied to
 * the same run in the usage log.
 */
export function createLovableAiGatewayRunIdFetch(initialRunId?: string) {
  const HEADER = 'X-Lovable-AIG-Run-ID';
  let runId = initialRunId?.trim() || undefined;

  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(HEADER)) headers.set(HEADER, runId);
      const response = await fetch(input, { ...init, headers });
      const returned = response.headers.get(HEADER)?.trim();
      if (!runId && returned) runId = returned;
      return response;
    },
    getRunId: () => runId,
  };
}
