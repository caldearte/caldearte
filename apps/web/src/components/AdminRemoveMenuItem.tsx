"use client";

import { useRouter } from "next/navigation";
import { esCL } from "@/i18n/es-CL";
import { useAdminRemoveEvent } from "@/lib/useAdminRemoveEvent";

interface AdminRemoveMenuItemProps {
  eventId: string;
  eventTitle: string;
  // Called immediately on success (before the ~1.2s onRemoved delay in
  // useAdminRemoveEvent), so the caller can close its own kebab menu —
  // each of the 3 consumers keeps that state locally, not centrally.
  onRemoved?: () => void;
}

// Shared by EventCardBase/ExpoBentoCard/EventHorizontalListItem — the
// three components with a real role="menu" kebab dropdown. See
// EventDetailCard.tsx for the flat-ActionButton equivalent used on the
// event page itself. Never rendered unless useIsAdmin() is true — callers
// gate that, this component doesn't re-check it (the real enforcement is
// server-side, in /api/admin/remove-event; this button being visible/
// hidden is UX only).
export default function AdminRemoveMenuItem({ eventId, eventTitle, onRemoved }: AdminRemoveMenuItemProps) {
  const router = useRouter();
  const { removing, removed, handleRemove } = useAdminRemoveEvent({
    eventId,
    eventTitle,
    onRemoved: () => {
      onRemoved?.();
      // Card lists are server-fetched props all the way from app/page.tsx
      // — a full refetch is the simplest correct way to make the removed
      // card actually disappear, without lifting list state client-side
      // just to avoid one round-trip.
      router.refresh();
    },
  });

  return (
    <button
      type="button"
      role="menuitem"
      disabled={removing}
      onClick={handleRemove}
      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 border-t border-stone-100 disabled:opacity-50 cursor-pointer disabled:cursor-default"
    >
      {removed ? esCL.cardMenuRemoved : removing ? esCL.cardMenuRemoving : esCL.cardMenuRemove}
    </button>
  );
}
