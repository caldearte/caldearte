"use client";

import { useEffect, useRef, useState } from "react";
import { esCL } from "@/i18n/es-CL";

interface RegionCountRingProps {
  label: string; // desktop, full word ("INAUGURACIONES")
  shortLabel: string; // mobile, stacked above the ring on one line ("INAU.")
  count: number; // región+semana count — the cyan portion
  total: number; // Chile-wide count for the same week/filters — the grey portion is (total - count)
  kindLabel: string; // esCL.regionCountRingKindInauguraciones/Exposiciones — used in the tooltip sentence
}

const RADIUS = 32;
const STROKE_WIDTH = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Two-tone ring (cyan = región's share, grey = the rest of Chile) +
// visible "de X" text so the comparison survives even for a visitor who
// never hovers/taps (2026-08-18, per the user's own explicit design
// call — the tooltip below is supplementary detail, not where the
// core insight lives).
//
// Tooltip open/close: hover OPENS on desktop, a document-level
// click-outside listener CLOSES on both desktop and touch — NOT a plain
// onClick toggle. A toggle looks right in isolation but is wrong for a
// real mouse: hovering already opens it via onMouseEnter, so the click
// that follows a hover (completely normal mouse behavior — you hover,
// then click) immediately toggles it back closed. Real bug, found
// verifying this in the browser before merging.
export default function RegionCountRing({ label, shortLabel, count, total, kindLabel }: RegionCountRingProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tooltipOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setTooltipOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [tooltipOpen]);

  // total can legitimately be 0 (an empty week nationwide) — guard
  // against NaN/Infinity rather than assuming count <= total always
  // holds (a stale región count mid-navigation could momentarily exceed
  // a not-yet-updated total).
  const fraction = total > 0 ? Math.min(count / total, 1) : 0;
  const cyanLength = fraction * CIRCUMFERENCE;

  return (
    <div ref={containerRef} className="relative flex flex-col md:flex-row items-center gap-[4px] md:gap-[8px]">
      <span className="md:hidden font-geist font-semibold text-[10px] text-border-default tracking-[1px] whitespace-nowrap">{shortLabel}</span>
      <span className="hidden md:inline font-geist font-semibold text-[10px] text-border-default tracking-[1px] whitespace-nowrap">{label}</span>
      <button
        type="button"
        className="relative flex items-center justify-center cursor-pointer"
        onClick={() => setTooltipOpen(true)}
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        aria-label={esCL.regionCountRingTooltip(count, kindLabel, total)}
      >
        <svg width={RADIUS * 2 + STROKE_WIDTH} height={RADIUS * 2 + STROKE_WIDTH} viewBox={`0 0 ${RADIUS * 2 + STROKE_WIDTH} ${RADIUS * 2 + STROKE_WIDTH}`}>
          <g transform={`rotate(-90 ${RADIUS + STROKE_WIDTH / 2} ${RADIUS + STROKE_WIDTH / 2})`}>
            {/* Grey portion drawn first, full circle — cyan portion painted on top covers exactly its own share, leaving grey visible for the rest. */}
            <circle
              cx={RADIUS + STROKE_WIDTH / 2}
              cy={RADIUS + STROKE_WIDTH / 2}
              r={RADIUS}
              fill="none"
              stroke="var(--color-border-default)"
              strokeWidth={STROKE_WIDTH}
              opacity={0.4}
            />
            {cyanLength > 0 && (
              <circle
                cx={RADIUS + STROKE_WIDTH / 2}
                cy={RADIUS + STROKE_WIDTH / 2}
                r={RADIUS}
                fill="none"
                stroke="var(--color-stat-cyan)"
                strokeWidth={STROKE_WIDTH}
                strokeDasharray={`${cyanLength} ${CIRCUMFERENCE}`}
                strokeLinecap="butt"
              />
            )}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-fragment-mono font-bold text-[18px] text-text-primary leading-none">{count}</span>
          <span className="font-fragment-mono text-[9px] text-border-default leading-none mt-[2px]">{esCL.regionCountRingOfLabel(total)}</span>
        </div>
      </button>

      {tooltipOpen && (
        <div
          role="tooltip"
          className="absolute top-full mt-[8px] left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-[8px] bg-text-primary text-surface-white text-[12px] font-geist px-[12px] py-[8px] shadow-lg"
        >
          {esCL.regionCountRingTooltip(count, kindLabel, total)}
        </div>
      )}
    </div>
  );
}
