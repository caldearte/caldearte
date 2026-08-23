// Display-only shortening of the 16 admin_region_name values — the DB's
// canonical strings ("Región Metropolitana de Santiago", "Región de Los
// Lagos", ...) stay exactly as-is. Duplicated from
// apps/web/src/lib/regionNames.ts (separate package, same values;
// confirmed with the user 2026-08-04 on the web side). Falls back to the
// full name for anything unmapped, same defensive stance as the original.
// Extracted here 2026-08-23 (was a private copy inside notify.ts) once
// social-publish/run.ts needed the same shortening.
const SHORT_REGION_NAMES: Record<string, string> = {
  "Arica y Parinacota": "Arica y Parinacota",
  Tarapacá: "Tarapacá",
  Antofagasta: "Antofagasta",
  Atacama: "Atacama",
  Coquimbo: "Coquimbo",
  Valparaíso: "Valparaíso",
  "Región Metropolitana de Santiago": "Santiago",
  "Región del Libertador Gral. Bernardo O'Higgins": "O'Higgins",
  "Región del Maule": "Maule",
  "Región de Ñuble": "Ñuble",
  "Región del Biobío": "Biobío",
  "Región de la Araucanía": "Araucanía",
  "Región de Los Ríos": "Los Ríos",
  "Región de Los Lagos": "Los Lagos",
  "Región Aisén del Gral. Carlos Ibáñez del Campo": "Aisén",
  "Región de Magallanes y de la Antártica Chilena": "Magallanes",
};

export function shortRegionName(adminRegionName: string): string {
  return SHORT_REGION_NAMES[adminRegionName] ?? adminRegionName;
}
