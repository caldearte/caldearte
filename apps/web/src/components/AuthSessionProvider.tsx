"use client";

import { SessionProvider } from "next-auth/react";

// Wraps the app so client components can call useSession()/useIsAdmin().
// The root layout is a server component, so this small client boundary is
// the only structural change needed there.
export default function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
