"use client";

import { useState } from "react";
import { esCL } from "@/i18n/es-CL";

interface UseAdminRemoveEventArgs {
  eventId: string;
  eventTitle: string;
  // Called ~1.2s after a confirmed success — not immediately — so the
  // brief "Quitado" state is actually visible before the caller reacts
  // (closes a menu, refreshes the list, navigates away). Real gap found
  // 2026-08-06: with no loading/success state at all, a successful
  // removal looked identical to "nothing happened" from the admin's
  // point of view.
  onRemoved: () => void;
}

export function useAdminRemoveEvent({ eventId, eventTitle, onRemoved }: UseAdminRemoveEventArgs) {
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(false);

  async function handleRemove() {
    if (!window.confirm(esCL.cardMenuRemoveConfirm(eventTitle))) return;
    setRemoving(true);
    try {
      const res = await fetch("/api/admin/remove-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      if (!res.ok) throw new Error("remove failed");
      setRemoved(true);
      setTimeout(onRemoved, 1200);
    } catch {
      window.alert(esCL.cardMenuRemoveError);
      setRemoving(false);
    }
  }

  return { removing, removed, handleRemove };
}
