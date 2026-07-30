"use client";

import { esCL } from "@/i18n/es-CL";

interface FiltersSectionProps {
  familyMode: boolean;
  todayFilterOn: boolean;
  vigentesFilterOn: boolean;
  onToggleFamilyMode: () => void;
  onToggleTodayFilter: () => void;
  onToggleVigentesFilter: () => void;
}

// Same pill visual as the old (now removed) WindowModeToggle in
// CityPickerPanel — rounded-full, dark-fill when on, subtle when off —
// kept for visual consistency, not reinvented.
function FilterPill({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`text-sm rounded-full px-4 py-1.5 transition-colors ${
        on ? "bg-heading-gray text-white" : "bg-picker-subtle text-muted-gray"
      }`}
    >
      {label}
    </button>
  );
}

// Sits right below the Header, above the event sections — replaces the old
// Header-embedded Modo familiar toggle and the city picker's Hoy/Semanal
// mode toggle. Always one visible row of pills, no icon (dropped per
// feedback: it didn't add anything) and no collapse.
export default function FiltersSection({
  familyMode,
  todayFilterOn,
  vigentesFilterOn,
  onToggleFamilyMode,
  onToggleTodayFilter,
  onToggleVigentesFilter,
}: FiltersSectionProps) {
  return (
    <div className="py-3 flex items-center gap-2 flex-wrap" role="group" aria-label={esCL.filtersTitle}>
      <FilterPill label={esCL.familyMode} on={familyMode} onClick={onToggleFamilyMode} />
      <FilterPill label={esCL.filterToday} on={todayFilterOn} onClick={onToggleTodayFilter} />
      <FilterPill label={esCL.filterVigentes} on={vigentesFilterOn} onClick={onToggleVigentesFilter} />
    </div>
  );
}
