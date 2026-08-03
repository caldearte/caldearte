// Plain character-count truncation for card descriptions — not CSS
// line-clamp, since the Figma design shows "... ver mas" trailing
// INLINE at the exact cut point, not a separate line-clamp ellipsis with
// no room to inject a link afterward.
export function truncateChars(text: string, maxChars: number): { truncated: string; wasCut: boolean } {
  if (text.length <= maxChars) return { truncated: text, wasCut: false };
  // Cut at the last space before maxChars so words aren't sliced mid-word.
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return { truncated: lastSpace > 0 ? cut.slice(0, lastSpace) : cut, wasCut: true };
}
