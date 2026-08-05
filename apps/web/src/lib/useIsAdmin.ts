"use client";

import { useSession } from "next-auth/react";

// Kept separate from useEventCardActions.ts deliberately — that hook is
// pure business logic (dates, venue, share/calendar links) reused by
// contexts that have nothing to do with auth; folding session state into
// it would widen its responsibility and re-render its consumers on every
// session change for no shared benefit.
export function useIsAdmin(): boolean {
  const { data: session } = useSession();
  return session?.user?.isAdmin === true;
}
