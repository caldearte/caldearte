import { test } from "node:test";
import assert from "node:assert/strict";
import { toPlainLatin } from "./plain-text.js";

test("toPlainLatin: converts Mathematical Sans-Serif Bold — real bug, 2026-09-01, mhnchile caption title", () => {
  assert.equal(toPlainLatin("𝗟𝗮 𝘃𝗶𝗱𝗮 𝗲𝗻 𝘂𝗻𝗮 𝗺𝗶𝗿𝗮𝗱𝗮. 𝗙𝗲𝗿𝗻𝗮𝗻𝗱𝗼 𝗢𝗽𝗮𝘇𝗼"), "La vida en una mirada. Fernando Opazo");
});

test("toPlainLatin: converts Mathematical Bold, Italic, and Script styles", () => {
  assert.equal(toPlainLatin("𝐁𝐨𝐥𝐝"), "Bold");
  assert.equal(toPlainLatin("𝘐𝘵𝘢𝘭𝘪𝘤"), "Italic");
  assert.equal(toPlainLatin("𝒮𝒸𝓇𝒾𝓅𝓉"), "Script");
});

test("toPlainLatin: converts styled digits", () => {
  assert.equal(toPlainLatin("𝟏𝟐𝟑"), "123"); // bold digits
});

test("toPlainLatin: leaves real accented letters, emoji, and plain text untouched", () => {
  const text = "Título con tildes: áéíóúñ, y emoji 🎨 intactos";
  assert.equal(toPlainLatin(text), text);
});

test("toPlainLatin: handles Letterlike Symbols exceptions (Script/Fraktur/Double-Struck holes)", () => {
  assert.equal(toPlainLatin("ℬℰℱℋℐℒℳℛ"), "BEFHILMR");
  assert.equal(toPlainLatin("ℂℍℕℙℚℝℤ"), "CHNPQRZ");
});

test("toPlainLatin: handles surrogate-pair characters correctly (no mangling of multi-byte code points)", () => {
  // Real bug precedent (see instagram-item.ts's own history) — anything
  // iterating strings by UTF-16 code unit instead of code point can split
  // a surrogate pair. Array.from + codePoint math avoids that here.
  assert.equal(toPlainLatin("𝗔🎨𝗕"), "A🎨B");
});
