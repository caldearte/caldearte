"use client";

import { useMemo, useState } from "react";
import type { AdminVenue } from "@/lib/adminAnalytics";
import { filterVenues, kindCounts, type EspaciosFilters, type KindFilter } from "@/lib/espaciosFilter";
import { VENUE_KINDS, type VenueKind } from "@/lib/misionKpis";
import { shortRegionName } from "@/lib/regionNames";
import { venueSlug } from "@/lib/venueSlug";

// /admin/espacios (Daniel, 2026-10-25): the venue catalog, so new venues
// get their kind set here instead of by SQL. Each row's select saves on
// change through /api/admin/set-venue-kind; the list keeps the edited
// value locally, so no refetch is needed. Filter logic lives in
// lib/espaciosFilter.ts (tested).

const KIND_LABELS: Record<KindFilter, string> = {
  todos: "Todos",
  institucional: "Institucional",
  municipal: "Municipal",
  independiente: "Independiente",
  sin_clasificar: "Sin clasificar",
};

type SaveState = "saving" | "saved" | "error";

function formatDate(ymd: string | null): string {
  if (!ymd) return "—";
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
}

export default function EspaciosPage({
  venues: initialVenues,
  regions,
  initialKind,
}: {
  venues: AdminVenue[];
  regions: readonly string[];
  initialKind: KindFilter;
}) {
  const [venues, setVenues] = useState(initialVenues);
  const [filters, setFiltersState] = useState<EspaciosFilters>({ kind: initialKind, adminRegionName: "todas", query: "", onlyLive: true });
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [stickyIds, setStickyIds] = useState<ReadonlySet<string>>(new Set());

  // Changing any filter drops the sticky rows: the list re-reads fresh.
  function setFilters(update: (f: EspaciosFilters) => EspaciosFilters) {
    setFiltersState(update);
    setStickyIds(new Set());
  }

  const visible = useMemo(() => filterVenues(venues, filters, stickyIds), [venues, filters, stickyIds]);
  const counts = useMemo(() => kindCounts(venues, filters), [venues, filters]);

  async function setKind(venueId: string, kind: VenueKind | null) {
    const previous = venues.find((v) => v.id === venueId)?.kind ?? null;
    setVenues((vs) => vs.map((v) => (v.id === venueId ? { ...v, kind } : v)));
    setStickyIds((ids) => new Set(ids).add(venueId));
    setSaveState((s) => ({ ...s, [venueId]: "saving" }));
    try {
      const res = await fetch("/api/admin/set-venue-kind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, kind }),
      });
      const data = (await res.json().catch(() => null)) as { status?: string } | null;
      if (!res.ok || data?.status !== "updated") throw new Error(data?.status ?? "error");
      setSaveState((s) => ({ ...s, [venueId]: "saved" }));
    } catch {
      setVenues((vs) => vs.map((v) => (v.id === venueId ? { ...v, kind: previous } : v)));
      setSaveState((s) => ({ ...s, [venueId]: "error" }));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="font-geist text-[14px] text-text-primary/70 max-w-[680px]">
        Catálogo de espacios. El tipo es interno: no se muestra en la web ni lo lee la curaduría. Los espacios nuevos llegan sin clasificar.
      </p>

      <div className="flex flex-wrap gap-2">
        {(["todos", ...VENUE_KINDS, "sin_clasificar"] as KindFilter[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilters((f) => ({ ...f, kind: k }))}
            className={`font-fragment-mono uppercase text-[12px] px-3 py-2 rounded-sm border cursor-pointer ${
              filters.kind === k ? "bg-brand-magenta border-brand-magenta text-white" : "bg-white border-text-primary/20 text-text-primary"
            }`}
          >
            {KIND_LABELS[k]} ({counts[k]})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <input
          type="search"
          value={filters.query}
          onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          placeholder="Buscar por nombre, comuna o IG"
          className="font-geist text-[14px] bg-white border border-text-primary/20 rounded-sm px-3 py-2 w-full sm:w-[280px]"
        />
        <select
          value={filters.adminRegionName}
          onChange={(e) => setFilters((f) => ({ ...f, adminRegionName: e.target.value }))}
          className="font-geist text-[14px] bg-white border border-text-primary/20 rounded-sm px-3 py-2"
          aria-label="Región"
        >
          <option value="todas">Todas las regiones</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {shortRegionName(r)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 font-geist text-[14px] text-text-primary">
          <input type="checkbox" checked={filters.onlyLive} onChange={(e) => setFilters((f) => ({ ...f, onlyLive: e.target.checked }))} />
          Solo con eventos publicados
        </label>
        <span className="font-geist text-[13px] text-text-primary/60">{visible.length} espacios</span>
      </div>

      <div className="bg-white rounded-sm overflow-x-auto">
        <table className="w-full font-geist text-[14px] text-text-primary">
          <thead>
            <tr className="text-left font-fragment-mono uppercase text-[12px] text-text-primary/60">
              <th className="py-3 px-4 font-normal">Espacio</th>
              <th className="py-3 pr-4 font-normal">Región</th>
              <th className="py-3 pr-4 font-normal text-right">Eventos</th>
              <th className="py-3 pr-4 font-normal">Último</th>
              <th className="py-3 pr-4 font-normal">IG</th>
              <th className="py-3 pr-4 font-normal">Nos sigue</th>
              <th className="py-3 pr-4 font-normal">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((v) => (
              <tr key={v.id} className="border-t border-text-primary/10 align-middle">
                <td className="py-2 px-4">
                  {v.liveEvents > 0 ? (
                    <a href={`/espacios/${venueSlug(v)}`} target="_blank" rel="noreferrer" className="hover:text-brand-magenta">
                      {v.name}
                    </a>
                  ) : (
                    v.name
                  )}
                  {v.comuna ? <div className="text-[12px] text-text-primary/50">{v.comuna}</div> : null}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">{v.adminRegionName ? shortRegionName(v.adminRegionName) : "—"}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{v.liveEvents}</td>
                <td className="py-2 pr-4 whitespace-nowrap text-text-primary/70">{formatDate(v.lastOpening)}</td>
                <td className="py-2 pr-4">
                  {v.instagramHandle ? (
                    <a href={`https://www.instagram.com/${v.instagramHandle}/`} target="_blank" rel="noreferrer" className="hover:text-brand-magenta">
                      @{v.instagramHandle}
                    </a>
                  ) : (
                    <span className="text-text-primary/40">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">{v.followsCaldearteAt ? "Sí" : <span className="text-text-primary/40">—</span>}</td>
                <td className="py-2 pr-4 whitespace-nowrap">
                  <select
                    value={v.kind ?? ""}
                    onChange={(e) => setKind(v.id, e.target.value ? (e.target.value as VenueKind) : null)}
                    disabled={saveState[v.id] === "saving"}
                    aria-label={`Tipo de ${v.name}`}
                    className={`font-geist text-[13px] border rounded-sm px-2 py-1 ${v.kind ? "bg-white border-text-primary/20" : "bg-brand-magenta/10 border-brand-magenta"}`}
                  >
                    <option value="">Sin clasificar</option>
                    {VENUE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <span className="ml-2 text-[12px]">
                    {saveState[v.id] === "saving" ? <span className="text-text-primary/50">Guardando…</span> : null}
                    {saveState[v.id] === "saved" ? <span className="text-brand-magenta">Guardado</span> : null}
                    {saveState[v.id] === "error" ? <span className="text-red-700">No se pudo guardar</span> : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 ? <p className="font-geist text-[14px] text-text-primary/60 p-6">Ningún espacio con estos filtros.</p> : null}
      </div>
    </div>
  );
}
