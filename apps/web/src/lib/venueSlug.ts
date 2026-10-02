// URL slug for /espacios/[slug]: "<slugified name>-<first 8 hex chars of the
// venue's uuid>". The uuid prefix is what actually identifies the venue —
// the name part is only there for readable, keyword-bearing URLs — so a
// venue renamed later (name variants get merged by hand in the catalog)
// keeps resolving from its old links. 8 hex chars is 32 bits: collisions
// among a few hundred venues are not a practical concern, and a lookup
// takes the first match regardless.
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

export function venueSlug(venue: { id: string; name: string }): string {
  const prefix = venue.id.slice(0, ID_PREFIX_LENGTH).toLowerCase();
  const base = slugifyName(venue.name);
  return base ? `${base}-${prefix}` : prefix;
}

export function venueIdPrefixFromSlug(slug: string): string | null {
  const match = ID_PREFIX_PATTERN.exec(slug.toLowerCase());
  return match ? match[1] : null;
}
