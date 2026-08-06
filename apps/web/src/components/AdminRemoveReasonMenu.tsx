"use client";

import { esCL } from "@/i18n/es-CL";
import { useAdminRemoveEvent } from "@/lib/useAdminRemoveEvent";
import { BackArrowGlyph } from "./CardActionIcons";

interface AdminRemoveReasonMenuProps {
  eventId: string;
  onBack: () => void;
  // What the caller does once removal actually succeeds (~1.2s after
  // picking a reason, so "Evento quitado" is visible first) — e.g. close
  // the kebab menu + router.refresh() so the card disappears from a list,
  // or router.push("/") on the event's own standalone page (refreshing
  // IN PLACE there would just hit notFound() since the event is gone).
  // Deliberately not hardcoded here — the right follow-up differs by
  // caller, same reasoning EventDetailCard's own comment already gives.
  onRemoved: () => void;
}

// The reason-picking view a kebab menu (or EventDetailCard's own
// Compartir-style popover) switches to when "Quitar" is clicked — same
// "replace the panel, show a back arrow" pattern the share submenu
// already uses. Picking a reason IS the confirmation now (replaced
// window.confirm() 2026-08-06, user request), so there's no separate
// "are you sure" step here.
export default function AdminRemoveReasonMenu({ eventId, onBack, onRemoved }: AdminRemoveReasonMenuProps) {
  const { removing, removed, handleRemove } = useAdminRemoveEvent({ eventId, onRemoved });

  if (removing || removed) {
    return (
      <div role="menuitem" className="w-full px-3.5 py-2.5 text-sm text-red-600">
        {removed ? esCL.cardMenuRemoved : esCL.cardMenuRemoving}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray cursor-pointer"
        onClick={onBack}
      >
        <BackArrowGlyph color="black" />
        {esCL.cardMenuBack}
      </button>
      {esCL.cardMenuRemoveReasons.map((reason) => (
        <button
          key={reason.value}
          type="button"
          role="menuitem"
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 cursor-pointer"
          onClick={() => handleRemove(reason.value)}
        >
          {reason.label}
        </button>
      ))}
    </>
  );
}
