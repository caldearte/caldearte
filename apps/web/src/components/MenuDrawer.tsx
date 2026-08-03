import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

interface MenuDrawerProps {
  open: boolean;
  archiveHref: string | null; // "Expos anteriores" row — omitted when no month is archived yet
  familyMode: boolean;
  onToggleFamilyMode: () => void;
  onClose: () => void;
}

// Opens from both the mobile hamburger AND the desktop "☰ Menú" trigger —
// same drawer, same content on every screen size. Curatoría links out to
// its own /curatoria page (split from /privacidad 2026-07-30 — the merged
// page's title used to lead with "Privacidad" before "curatoría", a real
// UX-audit finding).
//
// Modo familiar moved back in here 2026-08-03 — rediseño 2.0.0 dropped
// FiltersSection (the old pill row) from the home page, and this drawer
// is a temporary home for the toggle until the new design gives it a
// permanent spot (Figma shows a real switch, "PARA IR EN FAMILIA",
// somewhere in the new layout — not built yet).
export default function MenuDrawer({ open, archiveHref, familyMode, onToggleFamilyMode, onClose }: MenuDrawerProps) {
  return (
    <>
      {/* z-50 (both) — above Header's fixed top nav (z-40, rediseño 2.0.0)
          so the backdrop actually dims it too, not just the page content.
          Backdrop and panel share z-50; the panel still paints on top
          because it comes later in this file's JSX (equal z-index ties
          resolve by DOM order). */}
      <div
        className={`fixed inset-0 z-50 bg-black/30 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-72 bg-white px-5 py-4 shadow-lg transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-heading-gray">{esCL.menu}</p>
          <button onClick={onClose} className="text-muted-gray text-sm">
            ✕
          </button>
        </div>
        <button
          type="button"
          onClick={onToggleFamilyMode}
          aria-pressed={familyMode}
          className="w-full text-left text-sm text-heading-gray py-2.5 border-b border-stone-200 flex items-center justify-between"
        >
          <span>{esCL.familyMode}</span>
          <span className={`w-9 h-5 rounded-full relative transition-colors ${familyMode ? "bg-heading-gray" : "bg-picker-subtle"}`}>
            <span
              className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${familyMode ? "translate-x-[18px]" : "translate-x-0.5"}`}
            />
          </span>
        </button>
        <Link href="/curatoria" onClick={onClose} className="w-full text-left text-sm text-heading-gray py-2.5 border-b border-stone-200 flex items-center justify-between">
          <span>{esCL.curatoria}</span>
          <span className="text-stone-300">›</span>
        </Link>
        {archiveHref && (
          <Link href={archiveHref} onClick={onClose} className="w-full text-left text-sm text-heading-gray py-2.5 border-b border-stone-200 flex items-center justify-between">
            <span>{esCL.archiveLink}</span>
            <span className="text-stone-300">›</span>
          </Link>
        )}
        <Link href="/contacto" onClick={onClose} className="w-full text-left text-sm text-heading-gray py-2.5 flex items-center justify-between">
          <span>{esCL.footer.contacto}</span>
          <span className="text-stone-300">›</span>
        </Link>
      </div>
    </>
  );
}
