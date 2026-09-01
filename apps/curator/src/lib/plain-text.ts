// Converts Unicode "styled text" (Mathematical Alphanumeric Symbols,
// U+1D400-U+1D7FF — the "𝗕𝗼𝗹𝗱", "𝘐𝘵𝘢𝘭𝘪𝘤", "𝓈𝒸𝓇𝒾𝓅𝓉" etc. fonts people paste
// from third-party "fancy text" generators into Instagram captions) back to
// plain ASCII. Real bug, found 2026-09-01: a real event's title
// ("𝗟𝗮 𝘃𝗶𝗱𝗮 𝗲𝗻 𝘂𝗻𝗮 𝗺𝗶𝗿𝗮𝗱𝗮. 𝗙𝗲𝗿𝗻𝗮𝗻𝗱𝗼 𝗢𝗽𝗮𝘇𝗼", mhnchile) rendered as
// blank tofu boxes in the automated flyer — Satori/next-og only has glyphs
// for the 3 loaded TTFs' actual character sets (Lato/Geist), nowhere near
// this Unicode block. The website itself doesn't have this problem (a
// browser's system font fallback covers it), so this was invisible until
// the flyer redesign started actually rendering these titles.
//
// String.prototype.normalize("NFKD") does NOT fix this — Unicode
// deliberately gives the Mathematical Alphanumeric block no compatibility
// decomposition (it's meant for math notation, not stylized prose), so
// this needs its own explicit mapping.
//
// Each style is a contiguous run of 26 uppercase letters immediately
// followed by 26 lowercase (a few digit-only styles are 10 digits) — walk
// every known base code point and compute the plain-ASCII offset, rather
// than hand-writing out ~1,300 individual character mappings.
const LETTER_STYLE_BASES = [
  0x1d400, // Bold
  0x1d434, // Italic
  0x1d468, // Bold Italic
  0x1d49c, // Script
  0x1d4d0, // Bold Script
  0x1d504, // Fraktur
  0x1d538, // Double-Struck
  0x1d56c, // Bold Fraktur
  0x1d5a0, // Sans-Serif
  0x1d5d4, // Sans-Serif Bold (what mhnchile's caption used)
  0x1d608, // Sans-Serif Italic
  0x1d63c, // Sans-Serif Bold Italic
  0x1d670, // Monospace
];

const DIGIT_STYLE_BASES = [
  0x1d7ce, // Bold
  0x1d7d8, // Double-Struck
  0x1d7e2, // Sans-Serif
  0x1d7ec, // Sans-Serif Bold
  0x1d7f6, // Monospace
];

// A handful of code points in the Script/Fraktur/Double-Struck styles were
// assigned to the pre-existing Letterlike Symbols block instead of this
// one, for historical Unicode compatibility (they already existed as math
// symbols like ℂ for the complex numbers before this block was added) —
// the range-based math above silently skips these "holes", so they're
// listed explicitly.
const LETTERLIKE_EXCEPTIONS: Record<string, string> = {
  "ℬ": "B", // Script
  "ℰ": "E",
  "ℱ": "F",
  "ℋ": "H",
  "ℐ": "I",
  "ℒ": "L",
  "ℳ": "M",
  "ℛ": "R",
  "ℯ": "e",
  "ℊ": "g",
  "ℴ": "o",
  "ℭ": "C", // Fraktur
  "ℌ": "H",
  "ℑ": "I",
  "ℜ": "R",
  "ℨ": "Z",
  "ℂ": "C", // Double-Struck
  "ℍ": "H",
  "ℕ": "N",
  "ℙ": "P",
  "ℚ": "Q",
  "ℝ": "R",
  "ℤ": "Z",
};

const charMap = new Map<string, string>();
for (const base of LETTER_STYLE_BASES) {
  for (let i = 0; i < 26; i++) charMap.set(String.fromCodePoint(base + i), String.fromCharCode(65 + i)); // A-Z
  for (let i = 0; i < 26; i++) charMap.set(String.fromCodePoint(base + 26 + i), String.fromCharCode(97 + i)); // a-z
}
for (const base of DIGIT_STYLE_BASES) {
  for (let i = 0; i < 10; i++) charMap.set(String.fromCodePoint(base + i), String.fromCharCode(48 + i)); // 0-9
}
for (const [char, plain] of Object.entries(LETTERLIKE_EXCEPTIONS)) charMap.set(char, plain);

// Converts every styled-Unicode letter/digit in `text` back to its plain
// ASCII equivalent; anything not in the map (real accented letters, emoji,
// punctuation, CJK, ...) passes through untouched.
export function toPlainLatin(text: string): string {
  return Array.from(text)
    .map((char) => charMap.get(char) ?? char)
    .join("");
}
