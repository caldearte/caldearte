"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface HeadingDropdownProps {
  label: ReactNode;
  ariaLabel: string;
  listAriaLabel: string;
  // Renders the popover's content; call `close` after acting on a choice.
  children: (close: () => void) => ReactNode;
}

// A word inside the home's h1 that opens a list (2026-10-12): "[Esta
// semana ⌄] en [Santiago ⌄]" — the week (WeekDropdown) and the región
// (RegionDropdown). Inherits the h1's type; closes on an outside click or
// Escape.
export default function HeadingDropdown({ label, ariaLabel, listAriaLabel, children }: HeadingDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
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
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-baseline gap-[8px] text-left underline decoration-text-primary/25 decoration-[3px] underline-offset-[6px] cursor-pointer hover:decoration-brand-magenta"
      >
        {label}
        {/* Inline (not the 1.6px-stroke chevron-down.svg) so it matches the
            h1's weight and color. */}
        <svg viewBox="0 0 16 16" aria-hidden="true" className={`self-center shrink-0 size-[0.6em] transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={listAriaLabel}
          className="absolute left-0 top-full mt-[10px] z-30 w-[min(320px,calc(100vw-40px))] max-h-[65vh] overflow-y-auto rounded-[10px] bg-surface-white shadow-lg border border-text-primary/10 py-[6px] font-geist font-normal text-[15px] leading-normal tracking-normal"
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
