import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

interface MenuDrawerProps {
  open: boolean;
  archiveHref: string | null; // "Expos anteriores" row — omitted when no month is archived yet
  onClose: () => void;
}

// Opens from both the mobile hamburger AND the desktop "☰ Menú" trigger —
// same drawer, same content on every screen size. Curatoría links out to
// its own /curatoria page (split from /privacidad 2026-07-30 — the merged
// page's title used to lead with "Privacidad" before "curatoría", a real
// UX-audit finding). No Modo familiar row here anymore — that toggle lives
// in FiltersSection now, visible on every screen size without opening this
// drawer.
export default function MenuDrawer({ open, archiveHref, onClose }: MenuDrawerProps) {
  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-black/30 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 bottom-0 z-40 w-72 bg-white px-5 py-4 shadow-lg transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-heading-gray">{esCL.menu}</p>
          <button onClick={onClose} className="text-muted-gray text-sm">
            ✕
          </button>
        </div>
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
