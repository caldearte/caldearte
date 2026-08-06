"use client";

import { useState } from "react";
import { esCL } from "@/i18n/es-CL";

// Any event whose sensitivityTags (server-fetched, events_public's own
// synthetic fold — see the migration's comment) includes this was
// manually flagged by an admin, not by Haiku's own curation pass — Haiku
// only ever writes desnudo_erotismo/guerra_violencia/memoria_dictadura.
// Exported so callers can compute the initial toggle state without a
// separate round-trip.
export const ADMIN_SENSITIVE_TAG = "marcado_admin";

interface UseAdminToggleSensitiveArgs {
  eventId: string;
  initialMarked: boolean;
  // Called ~1.2s after a confirmed success, same reasoning as
  // useAdminRemoveEvent's own onRemoved delay — the brief status text
  // needs to actually be visible before the caller reacts (router.refresh
  // — the blur itself only updates once the server re-sends the updated
  // sensitivityTags, this isn't a purely client-side toggle).
  onToggled: () => void;
}

// Deliberately no confirm() dialog, unlike useAdminRemoveEvent — this is
// a toggle, not a one-way action; instantly reversible by clicking again,
// doesn't warrant the same ceremony as a removal.
export function useAdminToggleSensitive({ eventId, initialMarked, onToggled }: UseAdminToggleSensitiveArgs) {
  const [marked, setMarked] = useState(initialMarked);
  const [toggling, setToggling] = useState(false);
  const [justToggled, setJustToggled] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      const res = await fetch("/api/admin/toggle-sensitive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = (await res.json().catch(() => null)) as { status?: string } | null;
      if (!res.ok || (data?.status !== "marked" && data?.status !== "unmarked")) {
        throw new Error(data?.status ?? "error");
      }
      setMarked(data.status === "marked");
      setJustToggled(true);
      setTimeout(onToggled, 1200);
    } catch {
      window.alert(esCL.cardMenuToggleSensitiveError);
      setToggling(false);
    }
  }

  return { marked, toggling, justToggled, handleToggle };
}
