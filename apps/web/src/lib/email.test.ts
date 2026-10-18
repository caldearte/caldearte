import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_MAX_LENGTH, emailIssue, isValidEmail } from "./email";

test("isValidEmail: accepts the ordinary shapes people actually type", () => {
  for (const email of ["ana@gmail.com", "a.b+expos@sub.dominio.cl", "galeria@museo.gob.cl", "x@y.co", "Ana.Perez@Gmail.com", "o'brien@hotmail.cl", "ana@yahoo.es", "info@galeria-sur.cl", "ana_99@outlook.com"]) {
    assert.ok(isValidEmail(email), email);
  }
});

test("isValidEmail: rejects garbage the old pattern also rejected", () => {
  for (const email of ["", "ana", "ana@", "@gmail.com", "ana@gmail", "ana gomez@gmail.com", "ana@@gmail.com"]) {
    assert.equal(isValidEmail(email), false, email);
  }
});

test("isValidEmail: rejects empty domain labels", () => {
  assert.equal(isValidEmail("ana@.cl"), false);
  assert.equal(isValidEmail("ana@gmail..com"), false);
  assert.equal(isValidEmail("ana@gmail.com."), false);
});

test("isValidEmail: rejects anything over the practical maximum length", () => {
  const local = "a".repeat(EMAIL_MAX_LENGTH - "@example.com".length + 1);
  assert.equal(isValidEmail(`${local}@example.com`), false);
});

test("isValidEmail: stays fast on the input that made the old regex backtrack", () => {
  const evil = "a@" + ".".repeat(50_000) + "!";
  const start = performance.now();
  assert.equal(isValidEmail(evil), false);
  // Same shape without the length cap, to time the regex itself: ends on an
  // empty label, so it must fail after scanning ~100k chars.
  const evilNoCap = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test("a@" + "a.".repeat(50_000) + ".");
  assert.equal(evilNoCap, false);
  assert.ok(performance.now() - start < 100, "linear-time match");
});

test("emailIssue: ñ, tildes and other non-ASCII get their own message", () => {
  // The real case (2026-10-18): ñ typed for the l next to it on a Spanish keyboard.
  for (const email of ["muñoz@gmail.com", "josé@gmail.com", "ana@ñuñoa.cl", "maría.pérez@hotmail.com", "ana@gmail.com\u200b"]) {
    assert.deepEqual(emailIssue(email), { kind: "accent" }, email);
  }
});

test("emailIssue: rejects characters and dots no mailbox has", () => {
  for (const email of [
    "ana,perez@gmail.com",
    "ana;@gmail.com",
    "(ana)@gmail.com",
    "\"ana\"@gmail.com",
    ".ana@gmail.com",
    "ana.@gmail.com",
    "ana..perez@gmail.com",
    "ana@gmail,com",
    "ana@gm_ail.com",
    "ana@-gmail.com",
    "ana@gmail-.com",
    "ana@gmail.c",
    "ana@gmail.c0m",
    "ana@192.168.0.1",
    "a".repeat(65) + "@gmail.com",
  ]) {
    assert.deepEqual(emailIssue(email), { kind: "invalid" }, email);
  }
});

test("emailIssue: common provider and .com typos suggest the fix", () => {
  const cases: Array<[string, string]> = [
    ["ana@gmial.com", "ana@gmail.com"],
    ["ana@gamil.com", "ana@gmail.com"],
    ["ana@gmail.con", "ana@gmail.com"],
    ["ana@gmail.cl", "ana@gmail.com"],
    ["ana@gmail.co", "ana@gmail.com"],
    ["Ana@GMAIL.CON", "Ana@gmail.com"],
    ["ana@hotmial.com", "ana@hotmail.com"],
    ["ana@hotmal.cl", "ana@hotmail.cl"],
    ["ana@outlok.com", "ana@outlook.com"],
    ["ana@yahoo.cmo", "ana@yahoo.com"],
    ["ana@empresa.con", "ana@empresa.com"],
  ];
  for (const [email, suggestion] of cases) {
    assert.deepEqual(emailIssue(email), { kind: "typo", suggestion }, email);
    assert.equal(isValidEmail(email), false, email);
  }
});

test("emailIssue: real country domains of providers that have them stay valid", () => {
  for (const email of ["ana@hotmail.cl", "ana@hotmail.es", "ana@outlook.cl", "ana@yahoo.com.ar", "ana@live.cl", "ana@googlemail.com"]) {
    assert.equal(emailIssue(email), null, email);
  }
});
