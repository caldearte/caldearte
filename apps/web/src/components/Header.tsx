"use client";

import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { useIsAdmin } from "@/lib/useIsAdmin";
import SiteWordmark from "./SiteWordmark";

interface HeaderProps {
  onOpenSearch: () => void;
  onOpenMenu: () => void;
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

// Fixed top bar (2026-10-12): the "CALDE / ARTE." wordmark, search and
// menu. Replaces the full-height hero (two-line 96px wordmark,
// three-line tagline, SEMANA N°X, the location button and the count
// rings) that pushed the first event ~1.4 screens down on a phone.
export default function Header({ onOpenSearch, onOpenMenu }: HeaderProps) {
  return (
    <header>
      {/* `fixed`, not `sticky` — sticky silently failed to pin here
          (verified in-browser). An equal-height spacer below reserves its
          space in normal flow; keep both heights in sync with the
          wordmark's size (two lines at 32px / 40px, leading-none). */}
      <div className="fixed top-0 inset-x-0 z-40 bg-surface-sage border-b border-text-primary/10">
        <div className="max-w-[1600px] mx-auto h-[84px] md:h-[104px] flex items-center justify-between px-[18px] md:px-[40px] xl:px-[80px]">
          <SiteWordmark />
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
