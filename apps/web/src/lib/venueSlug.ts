// URL slug for /espacios/[slug] and /artistas/[slug]: "<slugified name>-<first
// 8 hex chars of the row's uuid>". The uuid prefix is what actually
// identifies the venue/artist — the name part is only there for readable,
// keyword-bearing URLs — so a row renamed later (name variants get merged by
// hand in the catalog) keeps resolving from its old links. 8 hex chars is 32
// bits: collisions among a few hundred rows are not a practical concern, and
// a lookup takes the first match regardless.
const ID_PREFIX_LENGTH = 8;
const MAX_NAME_SLUG_LENGTH = 60;
const ID_PREFIX_PATTERN = /(?:^|-)([0-9a-f]{8})$/;

export function slugifyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_NAME_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

export function entitySlug(entity: { id: string; name: string }): string {
  const prefix = entity.id.slice(0, ID_PREFIX_LENGTH).toLowerCase();
  const base = slugifyName(entity.name);
  return base ? `${base}-${prefix}` : prefix;
}

export const venueSlug = entitySlug;
export const artistSlug = entitySlug;

export function venueIdPrefixFromSlug(slug: string): string | null {
  const match = ID_PREFIX_PATTERN.exec(slug.toLowerCase());
  return match ? match[1] : null;
}

export function findBySlug<T extends { id: string }>(items: readonly T[], slug: string): T | undefined {
  const prefix = venueIdPrefixFromSlug(slug);
  if (!prefix) return undefined;
  return items.find((item) => item.id.toLowerCase().startsWith(prefix));
}
