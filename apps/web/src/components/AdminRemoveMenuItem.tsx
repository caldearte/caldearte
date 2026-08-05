"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { esCL } from "@/i18n/es-CL";

interface AdminRemoveMenuItemProps {
  eventId: string;
  eventTitle: string;
  // Called right before the fetch resolves successfully, so the caller
  // can close its own kebab menu (each of the 3 consumers keeps that
  // state locally, not centrally).
  onRemoved?: () => void;
}

// Shared by EventCardBase/ExpoBentoCard/EventHorizontalListItem — the
// three components with a real role="menu" kebab dropdown (see
// InauguracionBentoCard.tsx/EventDetailCard.tsx's own comments for why
// "Quitar" was deliberately NOT added there instead). Never rendered
// unless useIsAdmin() is true — callers gate that, this component doesn't
// re-check it (the real enforcement is server-side, in
// /api/admin/remove-event; this button being visible/hidden is UX only).
export default function AdminRemoveMenuItem({ eventId, eventTitle, onRemoved }: AdminRemoveMenuItemProps) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

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
      onRemoved?.();
      // Card lists are server-fetched props all the way from app/page.tsx
      // — a full refetch is the simplest correct way to make the removed
      // card actually disappear, without lifting list state client-side
      // just to avoid one round-trip.
      router.refresh();
    } catch {
      window.alert(esCL.cardMenuRemoveError);
      setRemoving(false);
    }
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled={removing}
      onClick={handleRemove}
      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 border-t border-stone-100 disabled:opacity-50 cursor-pointer disabled:cursor-default"
    >
      {esCL.cardMenuRemove}
    </button>
  );
}
