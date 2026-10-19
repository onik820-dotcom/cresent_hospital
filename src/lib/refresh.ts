import { useEffect, useState } from 'react';

/**
 * Screens load their data once, after they open. When a form saves something,
 * the row is in the database but the list on screen is the one fetched a
 * moment earlier — so the manager saves an expense and sees nothing happen.
 *
 * A save announces itself here and every open screen refetches. It is a blunt
 * instrument on purpose: a station screen shows a handful of rows, and the
 * cost of asking again is smaller than the cost of showing yesterday's figure.
 */
const EVENT = 'jhm:refresh';

export function signalRefresh() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

/** Changes whenever something was saved; use it as an effect dependency. */
export function useRefreshKey(): number {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const bump = () => setKey((k) => k + 1);
    window.addEventListener(EVENT, bump);
    return () => window.removeEventListener(EVENT, bump);
  }, []);
  return key;
}
