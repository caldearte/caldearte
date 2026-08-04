// Chile's 16 admin regions grouped into 5 geographic "zonas" — a
// display-only grouping for the 3-step location selector (Zona -> Región
// -> Comuna), not a DB concept. Keyed by the exact canonical
// admin_region_name values (same strings regionNames.ts maps from), so it
// composes directly with RegionMeta.adminRegionName without a separate
// lookup table to keep in sync.
export type ZoneKey = "norte-grande" | "norte-chico" | "central" | "sur" | "austral";

export interface Zone {
  key: ZoneKey;
  label: string; // e.g. "Norte Grande" — callers apply their own casing/uppercase
}

// North-to-south display order.
export const ZONES: Zone[] = [
  { key: "norte-grande", label: "Norte Grande" },
  { key: "norte-chico", label: "Norte Chico" },
  { key: "central", label: "Central" },
  { key: "sur", label: "Sur" },
  { key: "austral", label: "Austral" },
];

const ZONE_KEY_BY_REGION: Record<string, ZoneKey> = {
  "Arica y Parinacota": "norte-grande",
  Tarapacá: "norte-grande",
  Antofagasta: "norte-grande",
  Atacama: "norte-chico",
  Coquimbo: "norte-chico",
  Valparaíso: "central",
  "Región Metropolitana de Santiago": "central",
  "Región del Libertador Gral. Bernardo O'Higgins": "central",
  "Región del Maule": "central",
  "Región de Ñuble": "sur",
  "Región del Biobío": "sur",
  "Región de la Araucanía": "sur",
  "Región de Los Ríos": "sur",
  "Región de Los Lagos": "sur",
  "Región Aisén del Gral. Carlos Ibáñez del Campo": "austral",
  "Región de Magallanes y de la Antártica Chilena": "austral",
};

// Falls back to null (not a guess) for anything unmapped — same defensive
// stance as shortRegionName, in case a 17th región is ever added to the DB
// list before this map is updated alongside it.
export function zoneKeyForRegion(adminRegionName: string): ZoneKey | null {
  return ZONE_KEY_BY_REGION[adminRegionName] ?? null;
}

export function zoneByKey(key: ZoneKey): Zone {
  return ZONES.find((z) => z.key === key) ?? ZONES[0];
}
