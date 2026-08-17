"use client";

import type { Granularity } from "@/lib/adminAnalyticsBucketing";

const OPTIONS: { value: Granularity; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "year", label: "Año" },
  { value: "total", label: "Total" },
];

// One shared control at the top of the dashboard drives every chart —
// AdminDashboard owns the state and re-renders its children from the
// same in-memory payload, no re-fetch on toggle.
export default function GranularityToggle({
  value,
  onChange,
  hideTotal,
}: {
  value: Granularity;
  onChange: (granularity: Granularity) => void;
  // /admin's summary page only ever shows the CURRENT period (semana/mes/
  // año actual, not a historical series) — "Total" (all-time) has no
  // meaningful "current" reading, so it's hidden there (Daniel's explicit
  // request, 2026-08-17). Every other page keeps all 4 options.
  hideTotal?: boolean;
}) {
  const options = hideTotal ? OPTIONS.filter((opt) => opt.value !== "total") : OPTIONS;
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`font-fragment-mono uppercase text-[12px] px-3 py-1.5 rounded-sm border transition-colors ${
            value === opt.value
              ? "bg-brand-magenta text-white border-brand-magenta"
              : "bg-transparent text-text-primary border-text-primary/30 hover:border-text-primary/60"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
