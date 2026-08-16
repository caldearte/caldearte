"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { esCL } from "@/i18n/es-CL";
import { currentWeekInSantiago, fmtWeekRange } from "@/lib/date";
import { useIsAdmin } from "@/lib/useIsAdmin";

interface HeaderProps {
  regionName: string; // display name of the currently selected región, e.g. "Santiago" (shortRegionName's own shortened form)
  rangeStart: string; // YYYY-MM-DD — the current week's Monday
  rangeEnd: string; // YYYY-MM-DD — the current week's Sunday
  weekNumber: number; // "SEMANA N°X"
  prevWeekHref: string; // real navigation (URL, not a cookie) — see page.tsx
  nextWeekHref: string;
  onOpenCityPicker: () => void;
  cityPickerTriggerRef: RefObject<HTMLButtonElement | null>;
  onOpenSearch: () => void;
  onOpenMenu: () => void;
  isRefreshing: boolean;
}

// "Marching dashes" loading bar — replaces the week-range/chevron row
// while HomeClient's fetch is in flight (see that file's own comment on
// why a spinner/plain Link-pending check doesn't cover this gap). Fixed
// width rather than matching the row's exact (variable) text width —
// acceptable brief layout shift for a loading state, see the plan.
function WeekNavLoadingBar() {
  return (
    <div
      role="status"
      aria-label={esCL.weekLoadingAriaLabel}
      className="w-[140px] h-[3px] rounded-full animate-week-nav-dashes"
      style={{
        backgroundImage: "repeating-linear-gradient(90deg, var(--color-brand-magenta) 0 10px, transparent 10px 18px)",
        backgroundSize: "18px 100%",
      }}
    />
  );
}

function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={esCL.searchAriaLabel}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
      <img src="/icons/search.svg" alt="" width={20} height={20} />
    </button>
  );
}

function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={esCL.menu}>
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

// Compact single-line wordmark shown in the top nav only once the full
// hero has scrolled out of view — same font/color as the hero wordmark,
// just small enough to sit in the nav row.
function CompactLogo({ size }: { size: "md" | "sm" }) {
  return (
    <span
      className={`font-lato font-black leading-none text-brand-magenta ${size === "md" ? "text-[28px]" : "text-[20px]"}`}
    >
      {esCL.appName}
    </span>
  );
}

function TopNavContent({
  scrolledPastHero,
  onOpenSearch,
  onOpenMenu,
}: {
  scrolledPastHero: boolean;
  onOpenSearch: () => void;
  onOpenMenu: () => void;
}) {
  if (!scrolledPastHero) {
    return (
      <div className="flex items-center justify-end gap-[15px] px-[15px] md:px-[60px] py-[15px] md:py-[20px]">
        <AdminLink />
        <div className="flex items-center gap-[10px]">
          <SearchButton onClick={onOpenSearch} />
          <MenuButton onClick={onOpenMenu} />
        </div>
      </div>
    );
  }
  return (
    <>
      {/* Desktop: logo left, icons right. */}
      <div className="hidden md:flex items-center justify-between px-[60px] py-[20px]">
        <CompactLogo size="md" />
        <div className="flex items-center gap-[15px]">
          <AdminLink />
          <div className="flex items-center gap-[10px]">
            <SearchButton onClick={onOpenSearch} />
            <MenuButton onClick={onOpenMenu} />
          </div>
        </div>
      </div>
      {/* Mobile: search left, logo centered, menu right. Admin link, when
          present, rides along in the same slot as the hamburger — the
          mobile row has no spare room for a fourth element. */}
      <div className="md:hidden flex items-center justify-between px-[15px] py-[15px]">
        <SearchButton onClick={onOpenSearch} />
        <CompactLogo size="sm" />
        <div className="flex items-center gap-[10px]">
          <AdminLink />
          <MenuButton onClick={onOpenMenu} />
        </div>
      </div>
    </>
  );
}

export default function Header({
  regionName,
  rangeStart,
  rangeEnd,
  weekNumber,
  prevWeekHref,
  nextWeekHref,
  onOpenCityPicker,
  cityPickerTriggerRef,
  onOpenSearch,
  onOpenMenu,
  isRefreshing,
}: HeaderProps) {
  const weekRangeLabel = fmtWeekRange(rangeStart, rangeEnd);
  // "Semana actual" link — only when the week actually being shown isn't
  // the real current week (Daniel's explicit request, 2026-08-16). A
  // real ?semana= Link, same as the prev/next chevrons, so clicking it
  // goes through the exact same fetch + isRefreshing loading state, not
  // a special case.
  const currentWeekStart = currentWeekInSantiago().start;
  const isCurrentWeek = rangeStart === currentWeekStart;
  const currentWeekHref = `/?semana=${currentWeekStart}`;
  const heroRef = useRef<HTMLDivElement>(null);
  // Only the top nav (Buscar/Menú row) is sticky — the hero itself scrolls
  // away normally. Once the hero is fully out of view, the sticky nav
  // shows a small single-line wordmark so there's still a way to tell
  // which site you're on/get back to the top — desktop puts it on the
  // left (icons stay right), mobile centers it between the two icons.
  const [scrolledPastHero, setScrolledPastHero] = useState(false);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const observer = new IntersectionObserver(([entry]) =>
      setScrolledPastHero(!entry.isIntersecting),
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  return (
    <header>
      {/* `fixed`, not `sticky` — pinned to the viewport regardless of any
          ancestor's containing-block quirks (sticky turned out to silently
          fail to pin here, verified in-browser: the element just scrolled
          away with the page despite correct sticky/top-0 CSS). The content
          row inside is still capped to the page's own 1280px column so the
          icons/logo line up with everything else. A same-markup invisible
          clone directly above the hero reserves the identical amount of
          space in normal flow, so content doesn't jump when this appears. */}
      <div className="fixed top-0 inset-x-0 z-40 bg-surface-sage">
        <div className="max-w-[1280px] mx-auto">
          <TopNavContent
            scrolledPastHero={scrolledPastHero}
            onOpenSearch={onOpenSearch}
            onOpenMenu={onOpenMenu}
          />
        </div>
      </div>
      <div className="invisible max-w-[1280px] mx-auto" aria-hidden="true">
        <TopNavContent
          scrolledPastHero={scrolledPastHero}
          onOpenSearch={() => {}}
          onOpenMenu={() => {}}
        />
      </div>

      {/* hero — wordmark + tagline (left), location + week nav (right) */}
      <div
        ref={heroRef}
        className="flex flex-col md:flex-row gap-20 md:gap-[120px] items-start md:items-end justify-center pb-8 md:pb-[110px] px-4 md:px-[80px]"
      >
        <div className="flex-1 flex flex-col gap-[10px]">
          <h1 className="font-lato font-black leading-none text-brand-magenta text-[48px] md:text-[96px]">
            <span className="block">{esCL.wordmarkLine1}</span>
            <span className="block">{esCL.wordmarkLine2}</span>
          </h1>
          {/* Desktop: one line. Mobile: forced onto 3 explicit lines
              (design decision, not natural wrap) — see
              heroTaglineMobileLines. */}
          <p className="hidden md:block font-geist font-semibold text-[15px] text-text-secondary tracking-[2px] md:w-[168px]">
            {esCL.heroTagline}
          </p>
          <p className="md:hidden font-geist font-semibold text-[15px] text-text-secondary tracking-[2px]">
            {esCL.heroTaglineMobileLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </p>
        </div>

        {/* self-center overrides the hero's own items-start (mobile) —
            that alignment is about the wordmark column staying flush left,
            not about this selector block, which should sit centered in
            the available width regardless. Desktop already centers it via
            items-end on the row, so self-auto there is a no-op. */}
        <div className="self-center md:self-auto flex flex-col items-center gap-[11px]">
          {/* Wrapping div left as a plain flex-col (default
              align-items:stretch) so its width == the button's own
              content width, and the p (w-full, text-left) stretches to
              match — that's what pins "SEMANA N°X" to the button's own
              left edge instead of floating centered above it. */}
          <div className="flex flex-col gap-[11px]">
            <div className="w-full flex items-end justify-between gap-[9px]">
              <p className="text-left font-fragment-mono text-[18px] text-border-default tracking-[-0.84px]">
                {esCL.weekNumberLabel(weekNumber)}
              </p>
              {!isCurrentWeek && !isRefreshing && (
                <Link href={currentWeekHref} scroll={false} className="font-fragment-mono text-[12px] text-brand-magenta underline whitespace-nowrap">
                  {esCL.currentWeekLinkLabel}
                </Link>
              )}
            </div>

            <button
              ref={cityPickerTriggerRef}
              onClick={onOpenCityPicker}
              className="flex items-center gap-[9px] border border-border-default rounded-[9px] px-[30px] py-[23px] text-border-default"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img
                src="/icons/location-pin.svg"
                alt=""
                width={14}
                height={18}
                className="shrink-0"
              />
              {/* Mobile drops ", CHILE" to save space — just the región
                  name, truncated with an ellipsis past max-w so a long
                  región name can't blow out the pill/viewport. `p` nested
                  inside `span` is invalid HTML (block inside inline) and
                  was why the whole button disappeared; ellipsis also needs
                  a display other than plain inline plus an actual width to
                  overflow against — text-ellipsis alone does nothing on a
                  box that just grows to fit its content. Desktop keeps the
                  full "REGIÓN, CHILE" label, untruncated. */}
              <span className="md:hidden inline-block max-w-[200px] overflow-hidden text-ellipsis font-fragment-mono text-[20px] whitespace-nowrap">
                {regionName.toUpperCase()}
              </span>
              <span className="hidden md:inline font-fragment-mono text-[20px] whitespace-nowrap">
                {esCL.locationPillSuffix(regionName)}
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img
                src="/icons/chevron-right.svg"
                alt=""
                width={7}
                height={14}
                className="rotate-90 shrink-0"
              />
            </button>
          </div>

          <div className="flex items-center justify-center gap-[9px] h-[18px]">
            {isRefreshing ? (
              // Replaces both chevrons + the range text — see
              // WeekNavLoadingBar's own comment. Not rendering the
              // chevrons here also means a rapid repeat tap can't queue
              // another navigation mid-fetch.
              <WeekNavLoadingBar />
            ) : (
              <>
                {/* Hidden at SEMANA N°1 — that's the epoch week (lunes 27 de
                    julio de 2026, ver weekNumberSince en lib/date.ts), Caldearte
                    no existía antes de esa semana, así que no hay adónde
                    retroceder. weekNumberSince ya clampea a 1 cualquier semana
                    anterior al epoch, así que esta condición también cubre
                    (aunque nunca debería alcanzarse, dado que el chevron ya
                    estaría oculto) cualquier semana previa. */}
                {weekNumber > 1 && (
                  <Link
                    href={prevWeekHref}
                    aria-label={esCL.prevWeekAriaLabel}
                    scroll={false}
                    className="inline-flex shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
                    <img
                      src="/icons/chevron-right.svg"
                      alt=""
                      width={7}
                      height={14}
                      className="rotate-180"
                    />
                  </Link>
                )}
                <span className="font-fragment-mono text-[18px] text-border-default tracking-[-0.84px] whitespace-nowrap">
                  {weekRangeLabel}
                </span>
                <Link
                  href={nextWeekHref}
                  aria-label={esCL.nextWeekAriaLabel}
                  scroll={false}
                  className="inline-flex shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
                  <img
                    src="/icons/chevron-right.svg"
                    alt=""
                    width={7}
                    height={14}
                  />
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
