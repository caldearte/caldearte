import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_MAX_LENGTH, isValidEmail } from "./email";

test("isValidEmail: accepts the ordinary shapes people actually type", () => {
  for (const email of ["ana@gmail.com", "a.b+expos@sub.dominio.cl", "galeria@museo.gob.cl", "x@y.co"]) {
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
