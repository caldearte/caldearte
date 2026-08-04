// Display-only shortening of the 16 admin_region_name values — the DB's
// canonical strings ("Región Metropolitana de Santiago", "Región de Los
// Lagos", ...) stay exactly as-is (see the CHECK constraint in
// supabase/migrations/20260731150000_newsletter_subscribers_check_constraints.sql
// — that's a protected path, never touch it for a display-only concern).
// This is purely a UI-layer shortening: "Región de/del/Aisén del Gral.
// ..." dropped down to the shortest recognizable form, confirmed with
// the user 2026-08-04.
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

// Falls back to the full name for anything unmapped, rather than
// throwing — defensive against a 17th región ever being added to the DB
// list without this map being updated alongside it (same caveat the
// CHECK constraint's own migration comment already calls out).
export function shortRegionName(adminRegionName: string): string {
  return SHORT_REGION_NAMES[adminRegionName] ?? adminRegionName;
}
