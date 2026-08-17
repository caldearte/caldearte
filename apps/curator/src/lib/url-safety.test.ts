import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeExternalUrl } from "./url-safety.js";

test("isSafeExternalUrl: allows ordinary public http(s) URLs", () => {
  assert.equal(isSafeExternalUrl("https://galeriapready.cl/exhibiciones"), true);
  assert.equal(isSafeExternalUrl("http://example.com/image.jpg"), true);
});

test("isSafeExternalUrl: rejects non-http(s) protocols", () => {
  assert.equal(isSafeExternalUrl("file:///etc/passwd"), false);
  assert.equal(isSafeExternalUrl("ftp://example.com/x"), false);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
});

test("isSafeExternalUrl: rejects loopback and private RFC1918 ranges", () => {
  assert.equal(isSafeExternalUrl("http://127.0.0.1/"), false);
  assert.equal(isSafeExternalUrl("http://localhost:8080/"), false);
  assert.equal(isSafeExternalUrl("http://10.0.0.5/"), false);
  assert.equal(isSafeExternalUrl("http://172.16.0.1/"), false);
  assert.equal(isSafeExternalUrl("http://192.168.1.1/"), false);
});

// The real-world case this exists for: a scraped page's og:image pointing
// at a cloud metadata endpoint instead of a real image.
test("isSafeExternalUrl: rejects the link-local range, including the cloud metadata IP", () => {
  assert.equal(isSafeExternalUrl("http://169.254.169.254/latest/meta-data/"), false);
});

test("isSafeExternalUrl: rejects IPv6 loopback/unique-local/link-local", () => {
  assert.equal(isSafeExternalUrl("http://[::1]/"), false);
  assert.equal(isSafeExternalUrl("http://[fd12:3456::1]/"), false);
  assert.equal(isSafeExternalUrl("http://[fe80::1]/"), false);
});

test("isSafeExternalUrl: fails closed on an unparseable URL", () => {
  assert.equal(isSafeExternalUrl("not a url"), false);
});
