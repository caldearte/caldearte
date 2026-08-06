"use client";

import { esCL } from "@/i18n/es-CL";

interface AdminRemoveMenuItemProps {
  // Switches the parent's kebab dropdown into the reason-picking view
  // (AdminRemoveReasonMenu) — this component is just the trigger row now.
  // The actual remove hook/reason list moved out to AdminRemoveReasonMenu
  // 2026-08-06 (user request: pick a reason instead of a generic confirm
  // dialog), mirroring how "Compartir" already switches the same panel
  // into its own WhatsApp/X/Facebook sub-view.
  onClick: () => void;
}

// Shared by EventCardBase/ExpoBentoCard/EventHorizontalListItem — the
// three components with a real role="menu" kebab dropdown. See
// EventDetailCard.tsx for the flat-ActionButton equivalent used on the
// event page itself. Never rendered unless useIsAdmin() is true — callers
// gate that, this component doesn't re-check it (the real enforcement is
// server-side, in /api/admin/remove-event; this button being visible/
// hidden is UX only).
export default function AdminRemoveMenuItem({ onClick }: AdminRemoveMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-red-600 border-t border-stone-100 cursor-pointer"
    >
      {esCL.cardMenuRemove}
    </button>
  );
}
