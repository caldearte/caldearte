"use client";

import { useState } from "react";

// Mirrors useAdminToggleSensitive.ts's shape (loading/success/error
// states around a single POST) — this one's success state is different
// in kind though: it's not confirming a value that already changed
// (toggle-sensitive updates the DB synchronously), it's confirming a
// GitHub Actions workflow was successfully DISPATCHED, which then takes
// ~1-2 minutes to actually write fresh data. The caller shows an
// expectation-setting message, not a "done" state.
export function useRefreshInstagramInsights() {
  const [status, setStatus] = useState<"idle" | "loading" | "dispatched" | "error">("idle");

  async function refresh() {
    setStatus("loading");
    try {
      const res = await fetch("/api/admin/refresh-instagram-insights", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("dispatched");
    } catch {
      setStatus("error");
    }
  }

  return { status, refresh };
}
