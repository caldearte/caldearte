"use client";

import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { useIsAdmin } from "@/lib/useIsAdmin";
import SiteWordmark from "./SiteWordmark";
import { pinHomeSection, scrollToHomeSection, useHomeSection, type HomeSection } from "@/lib/useHomeSection";

interface HeaderProps {
  onOpenSearch: () => void;
  onOpenMenu: () => void;
  // The home's section links (desktop); off on pages that aren't the home
  // (the ficha, 2026-10-13: logo, search and menu only).
  sectionNav?: boolean;
  // Its own bottom line. Off on the home, where the sticky week/región
  // bar sits right under it and the two read as one block with a single
  // line under both (Daniel, 2026-10-13: no double line on scroll).
  bottomBorder?: boolean;
}

function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={esCL.searchAriaLabel} className="cursor-pointer">
      {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
      <img src="/icons/search.svg" alt="" width={20} height={20} />
    </button>
  );
}

function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={esCL.menu} className="cursor-pointer">
      {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
      <img src="/icons/hamburger.svg" alt="" width={22} height={20} />
    </button>
  );
}

// Only rendered for a session with isAdmin true (useIsAdmin, computed
// server-side in the jwt callback — see lib/auth.ts). /login itself stays
// deliberately unlinked (see that page's own comment); this link is only
// useful once already signed in as admin.
function AdminLink() {
  const isAdmin = useIsAdmin();
  if (!isAdmin) return null;
  return (
    <Link href="/admin" className="font-fragment-mono uppercase text-[14px] text-text-primary">
      {esCL.adminLink}
    </Link>
  );
}

// Jump links to the home's sections, desktop only (Daniel, 2026-10-13).
// Each lands right under the sticky week/región bar (scrollToHomeSection);
// "Destacado" is the top of the page (the
// agenda, under "EL ARTE MÁS CERCA"). If a section isn't on the page this
// week (no "Últimos días"), the link falls back to the cartelera's start.
// `section` is the useHomeSection value that marks the link active
// (magenta).
const SECTION_LINKS: { label: string; targets: string[]; section: HomeSection }[] = [
  { label: esCL.home.navDestacado, targets: [], section: "destacado" },
  { label: esCL.home.navCuratoria, targets: ["curatoria"], section: "curatoria" },
  { label: esCL.home.navUltimosDias, targets: ["ultimos-dias", "cartelera-section"], section: "ultimos" },
  { label: esCL.home.navCartelera, targets: ["cartelera", "cartelera-section"], section: "aun" },
  { label: esCL.home.navGuiaSemanal, targets: ["newsletter-section"], section: "guia" },
];

function SectionNav() {
  const active = useHomeSection();

  function go(targets: string[]) {
    if (targets.length === 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    // The laid-out copy only (Next can keep a hidden copy of the page).
    const el = targets
      .flatMap((id) => [...document.querySelectorAll<HTMLElement>(`[id="${id}"]`)])
      .find((e) => e.getClientRects().length > 0);
    if (el) scrollToHomeSection(el);
  }

  return (
    <nav aria-label={esCL.home.sectionNavAriaLabel} className="hidden lg:flex justify-center gap-[20px] xl:gap-[28px] min-w-0">
      {SECTION_LINKS.map((link) => (
        <a
          key={link.label}
          href={link.targets.length ? `#${link.targets[0]}` : "#"}
          onClick={(e) => {
            e.preventDefault();
            go(link.targets);
            pinHomeSection(link.section);
          }}
          aria-current={active === link.section ? "true" : undefined}
          className={`font-geist font-semibold text-[12px] tracking-[1.5px] uppercase whitespace-nowrap hover:text-brand-magenta ${
            active === link.section ? "text-brand-magenta" : "text-text-primary"
          }`}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

// Fixed top bar (2026-10-12): the "CALDE / ARTE." wordmark, the section
// links (desktop) and search + menu. Replaces the full-height hero (two-line 96px wordmark,
// three-line tagline, SEMANA N°X, the location button and the count
// rings) that pushed the first event ~1.4 screens down on a phone.
export default function Header({ onOpenSearch, onOpenMenu, sectionNav = true, bottomBorder = true }: HeaderProps) {
  return (
    <header>
      {/* `fixed`, not `sticky` — sticky silently failed to pin here
          (verified in-browser). An equal-height spacer below reserves its
          space in normal flow; keep both heights in sync with the
          wordmark's size (two lines at 32px / 40px, leading-none). */}
      <div className={`fixed top-0 inset-x-0 z-40 bg-surface-sage ${bottomBorder ? "border-b border-text-primary/10" : ""}`}>
        <div className="max-w-[1600px] mx-auto h-[84px] md:h-[104px] grid grid-cols-[auto_1fr_auto] items-center gap-[24px] px-[18px] md:px-[40px] xl:px-[80px]">
          <SiteWordmark />
          {sectionNav ? <SectionNav /> : <div />}
          <div className="flex items-center gap-[16px]">
            <AdminLink />
            <SearchButton onClick={onOpenSearch} />
            <MenuButton onClick={onOpenMenu} />
          </div>
        </div>
      </div>
      <div className="h-[84px] md:h-[104px]" aria-hidden="true" />
    </header>
  );
}
