"use client";

import { useRouter } from "next/navigation";
import { esCL } from "@/i18n/es-CL";
import { useAdminToggleSensitive } from "@/lib/useAdminToggleSensitive";

interface AdminSensitiveMenuItemProps {
  eventId: string;
  initialMarked: boolean;
  // Called immediately on success (before the ~1.2s onToggled delay), so
  // the caller can close its own kebab menu — mirrors AdminRemoveMenuItem.
  onToggled?: () => void;
}

// Same button covers both directions of the mistake: Haiku missed
// something sensitive (click to mark) and Haiku over-flagged something
// that isn't (click again to unmark) — a single toggle, not two buttons,
// so there's one obvious place to fix either kind of error.
export default function AdminSensitiveMenuItem({ eventId, initialMarked, onToggled }: AdminSensitiveMenuItemProps) {
  const router = useRouter();
  const { marked, toggling, justToggled, handleToggle } = useAdminToggleSensitive({
    eventId,
    initialMarked,
    onToggled: () => {
      onToggled?.();
      // Re-fetches server props so CardImage's blur reflects the new
      // sensitivity_tags — same reasoning as AdminRemoveMenuItem's own
      // router.refresh(), and the visible "did it actually work" signal
      // the admin asked for.
      router.refresh();
    },
  });

  const label = justToggled
    ? marked
      ? esCL.cardMenuMarkedSensitive
      : esCL.cardMenuUnmarkedSensitive
    : toggling
      ? marked
        ? esCL.cardMenuUnmarkingSensitive
        : esCL.cardMenuMarkingSensitive
      : marked
        ? esCL.cardMenuUnmarkSensitive
        : esCL.cardMenuMarkSensitive;

  return (
    <button
      type="button"
      role="menuitem"
      disabled={toggling}
      onClick={handleToggle}
      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-heading-gray border-t border-stone-100 disabled:opacity-50 cursor-pointer disabled:cursor-default"
    >
      {label}
    </button>
  );
}
