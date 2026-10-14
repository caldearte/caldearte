"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface HeadingDropdownProps {
  label: ReactNode;
  ariaLabel: string;
  listAriaLabel: string;
  // Which edge of the button the desktop panel lines up with — "right" for
  // a control sitting at the page's right edge, so the panel stays on
  // screen. Phones always get the full-width panel.
  align?: "left" | "right";
  // Renders the popover's content; call `close` after acting on a choice.
  children: (close: () => void) => ReactNode;
}

// A word inside the home's h1 that opens a list, boxed with a rounded gray
// border, magenta on hover (2026-10-12): "[Esta
// semana ⌄] en [Santiago ⌄]" — the week (WeekDropdown) and the región
// (RegionDropdown). Inherits the h1's type; while open the page behind is
// frozen and dimmed, and a click outside or Escape closes it.
export default function HeadingDropdown({ label, ariaLabel, listAriaLabel, align = "left", children }: HeadingDropdownProps) {
  const [open, setOpen] = useState(false);
  // Phone: the panel spans the whole screen width, just under the button
  // (Daniel, 2026-10-12 — anchored to the word, a 320px panel ran off the
  // right edge whenever the word sat mid-line, cutting the regions off).
  // Measured on open; null = the regular popover under the word (sm+).
  const [phoneTop, setPhoneTop] = useState<number | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!open && buttonRef.current && window.matchMedia("(max-width: 639px)").matches) {
      setPhoneTop(Math.round(buttonRef.current.getBoundingClientRect().bottom + 8));
    } else if (!open) {
      setPhoneTop(null);
    }
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    // The page behind stays put while a list is open (Daniel, 2026-10-12):
    // only the panel scrolls. Padding stands in for a desktop scrollbar
    // that disappears, so the layout doesn't jump sideways.
    const html = document.documentElement;
    const scrollbarGap = window.innerWidth - html.clientWidth;
    const previous = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
    html.style.overflow = "hidden";
    if (scrollbarGap > 0) html.style.paddingRight = `${scrollbarGap}px`;
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      html.style.overflow = previous.overflow;
      html.style.paddingRight = previous.paddingRight;
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
        // No underline (Daniel, 2026-10-13): on hover — and while open —
        // the border, the word and the chevron (currentColor) go magenta.
        className={`inline-flex items-baseline gap-[6px] md:gap-[8px] text-left rounded-[12px] border px-[10px] md:px-[14px] py-[6px] cursor-pointer transition-colors hover:border-brand-magenta hover:text-brand-magenta ${
          open ? "border-brand-magenta text-brand-magenta" : "border-text-primary/25"
        }`}
      >
        {label}
        {/* Inline (not the 1.6px-stroke chevron-down.svg) so it matches the
            h1's weight and color. */}
        <svg viewBox="0 0 16 16" aria-hidden="true" className={`self-center shrink-0 size-[0.6em] transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Backdrop: a tap outside the panel only closes it — it never
          reaches whatever link or button sits underneath. Dimmer on a
          phone, where the panel takes the whole width. */}
      {open && <div aria-hidden="true" onClick={() => setOpen(false)} className="fixed inset-0 z-[29] bg-black/30 sm:bg-black/10" />}

      {open && (
        <div
          role="listbox"
          aria-label={listAriaLabel}
          style={phoneTop !== null ? { top: phoneTop, maxHeight: `calc(100dvh - ${phoneTop + 12}px)` } : undefined}
          className={`z-30 overflow-y-auto overscroll-contain bg-surface-white shadow-lg border border-text-primary/10 py-[6px] font-geist font-normal text-[15px] leading-normal tracking-normal ${
            phoneTop !== null ? "fixed inset-x-0 rounded-b-[14px] border-x-0" : `absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-[10px] w-[320px] max-h-[65vh] rounded-[10px]`
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  );
}

// Shared row style for both dropdowns' options.
export const DROPDOWN_ROW =
  "w-full flex items-center justify-between gap-[12px] px-[14px] py-[9px] text-left font-geist text-[15px] cursor-pointer hover:bg-surface-sage";
