import type { Metadata } from "next";
import { esCL } from "@/i18n/es-CL";
import { fetchApprovedEvents } from "@/lib/events";
import AgregaExpoContent from "@/components/AgregaExpoContent";

export const metadata: Metadata = { title: `${esCL.agregaExpo.title} — ${esCL.appName}` };

export default async function AgregaExpoPage() {
  const { regions } = await fetchApprovedEvents();
  const comunas = [...regions]
    .sort((a, b) => (a.adminRegionOrder ?? 0) - (b.adminRegionOrder ?? 0) || a.name.localeCompare(b.name, "es"))
    .map((r) => ({ id: r.id, name: r.name, adminRegionName: r.adminRegionName }));

  return <AgregaExpoContent comunas={comunas} />;
}
