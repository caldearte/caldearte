import type { Metadata } from "next";
import { esCL } from "@/i18n/es-CL";
import { fetchApprovedEvents } from "@/lib/events";
import AgregaExpoContent from "@/components/AgregaExpoContent";

export const metadata: Metadata = { title: `${esCL.agregaExpo.title} — ${esCL.appName}` };

export default async function AgregaExpoPage() {
  const { events, regions } = await fetchApprovedEvents();
  const comunas = [...regions]
    .sort((a, b) => (a.adminRegionOrder ?? 0) - (b.adminRegionOrder ?? 0) || a.name.localeCompare(b.name, "es"))
    .map((r) => ({ id: r.id, name: r.name, adminRegionName: r.adminRegionName }));

  // Derived from real approved events, not a maintained registry — "galerías
  // ya mapeadas" is exactly the set of place_name values Event Discovery has
  // already curated. A dedicated shared venue-name file (reusable beyond
  // this form, e.g. for future dedup/matching in apps/curator) is a bigger
  // idea than this autocomplete needs; punted deliberately, see PR
  // description — this list still gets Daniel 90% of the value today with
  // zero new architecture.
  const galleries = [...new Set(events.map((e) => e.placeName).filter((name): name is string => !!name?.trim()))].sort(
    (a, b) => a.localeCompare(b, "es"),
  );

  return <AgregaExpoContent comunas={comunas} galleries={galleries} />;
}
