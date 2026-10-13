"use client";

import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import { useIsAdmin } from "@/lib/useIsAdmin";

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

// Slim fixed top bar (2026-10-12): "CALDEARTE calendario de arte" plus
// search and menu. Replaces the full-height hero (two-line 96px wordmark,
// three-line tagline, SEMANA N°X, the location button and the count
// rings) that pushed the first event ~1.4 screens down on a phone.
export default function Header({ onOpenSearch, onOpenMenu }: HeaderProps) {
  return (
    <header>
      {/* `fixed`, not `sticky` — sticky silently failed to pin here
          (verified in-browser). An equal-height spacer below reserves its
          space in normal flow. RegionNav's sticky offset (top-[52px])
          depends on this bar's mobile height. */}
      <div className="fixed top-0 inset-x-0 z-40 bg-surface-sage border-b border-text-primary/10">
        <div className="max-w-[1280px] mx-auto h-[52px] md:h-[64px] flex items-center justify-between px-[20px] md:px-[61px]">
          <Link href="/" className="flex items-baseline gap-[10px] min-w-0">
            <span className="font-lato font-black leading-none text-brand-magenta text-[24px] md:text-[28px]">{esCL.appName}</span>
            <span className="font-geist text-[13px] md:text-[14px] text-text-secondary truncate">{esCL.home.topBarLabel}</span>
          </Link>
          <div className="flex items-center gap-[16px] shrink-0">
            <AdminLink />
            <SearchButton onClick={onOpenSearch} />
            <MenuButton onClick={onOpenMenu} />
          </div>
        </div>
      </div>
      <div className="h-[52px] md:h-[64px]" aria-hidden="true" />
    </header>
  );
}
