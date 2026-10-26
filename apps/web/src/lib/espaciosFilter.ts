// /admin/espacios filters (2026-10-25) — pure, so the page's client
// component stays a thin shell and this is testable.

import type { AdminVenue } from "./adminAnalytics";
import { VENUE_KINDS, type VenueKind } from "./misionKpis";

export type KindFilter = "todos" | VenueKind | "sin_clasificar";

export interface EspaciosFilters {
  kind: KindFilter;
  adminRegionName: string | "todas";
  query: string;
  onlyLive: boolean;
}

export const DEFAULT_FILTERS: EspaciosFilters = { kind: "todos", adminRegionName: "todas", query: "", onlyLive: true };

export function parseKindFilter(value: string | undefined): KindFilter {
  if (value === "sin_clasificar" || (VENUE_KINDS as readonly string[]).includes(value ?? "")) return value as KindFilter;
  return "todos";
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Most live events first, then name — the spaces that matter most for
// the share are the ones worth classifying carefully.
// `stickyIds`: rows edited since the filters last changed stay listed
// even once their new kind no longer matches, so "Guardado" stays
// visible instead of the row vanishing mid-triage.
export function filterVenues(venues: readonly AdminVenue[], f: EspaciosFilters, stickyIds: ReadonlySet<string> = new Set()): AdminVenue[] {
  const q = normalize(f.query.trim());
  return venues
    .filter((v) => !f.onlyLive || v.liveEvents > 0)
    .filter((v) => f.kind === "todos" || stickyIds.has(v.id) || (f.kind === "sin_clasificar" ? v.kind === null : v.kind === f.kind))
    .filter((v) => f.adminRegionName === "todas" || v.adminRegionName === f.adminRegionName)
    .filter((v) => !q || normalize(`${v.name} ${v.comuna ?? ""} ${v.instagramHandle ?? ""}`).includes(q))
    .sort((a, b) => b.liveEvents - a.liveEvents || a.name.localeCompare(b.name, "es"));
}

// Per-kind venue counts for the filter chips, over the venues the other
// filters (región, search, live-only) leave in.
export function kindCounts(venues: readonly AdminVenue[], f: EspaciosFilters): Record<KindFilter, number> {
  const base = filterVenues(venues, { ...f, kind: "todos" });
  return {
    todos: base.length,
    institucional: base.filter((v) => v.kind === "institucional").length,
    municipal: base.filter((v) => v.kind === "municipal").length,
    independiente: base.filter((v) => v.kind === "independiente").length,
    sin_clasificar: base.filter((v) => v.kind === null).length,
  };
}
