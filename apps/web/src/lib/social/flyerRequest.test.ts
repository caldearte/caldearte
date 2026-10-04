import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFlyerParamLengths, parsePublicImageUrl } from "./flyerRequest";

test("parsePublicImageUrl: accepts the https hosts real events use", () => {
  for (const raw of [
    "https://wtuhloeyotjthvmvxmxj.supabase.co/storage/v1/object/public/event-images/a.jpg",
    "https://chilecultura.gob.cl/uploads/x.png",
    "https://static.arteinformado.com/resources/app/docs/evento/1.jpg",
  ]) {
    assert.ok(parsePublicImageUrl(raw), raw);
  }
});

test("parsePublicImageUrl: rejects non-https, credentials and garbage", () => {
  assert.equal(parsePublicImageUrl("http://example.com/a.jpg"), null);
  assert.equal(parsePublicImageUrl("file:///etc/passwd"), null);
  assert.equal(parsePublicImageUrl("https://user:pass@example.com/a.jpg"), null);
  assert.equal(parsePublicImageUrl("not a url"), null);
});

test("parsePublicImageUrl: rejects internal and private targets", () => {
  for (const raw of [
    "https://localhost/a.jpg",
    "https://127.0.0.1/a.jpg",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.5/a.jpg",
    "https://172.20.1.1/a.jpg",
    "https://192.168.1.1/a.jpg",
    "https://100.64.0.1/a.jpg",
    "https://0.0.0.0/a.jpg",
    "https://[::1]/a.jpg",
    "https://[fd00::1]/a.jpg",
    "https://[fe80::1]/a.jpg",
    "https://[::ffff:127.0.0.1]/a.jpg",
    "https://metadata.google.internal/a.jpg",
    "https://printer.local/a.jpg",
    "https://intranet/a.jpg",
  ]) {
    assert.equal(parsePublicImageUrl(raw), null, raw);
  }
});

test("parsePublicImageUrl: public IPs and 172.x outside the private block still pass", () => {
  assert.ok(parsePublicImageUrl("https://8.8.8.8/a.jpg"));
  assert.ok(parsePublicImageUrl("https://172.32.0.1/a.jpg"));
});

test("parsePublicImageUrl: localhost is refused in every form, dev included", () => {
  assert.equal(parsePublicImageUrl("http://localhost:3000/icon"), null);
  assert.equal(parsePublicImageUrl("https://localhost:3000/icon"), null);
  assert.equal(parsePublicImageUrl("https://app.localhost/a.jpg"), null);
});

test("checkFlyerParamLengths: real-sized values pass, oversized ones are named", () => {
  const ok = new URLSearchParams({ type: "inauguracion", title: "x".repeat(114), artist: "y".repeat(508) });
  assert.equal(checkFlyerParamLengths(ok), null);

  const tooLong = new URLSearchParams({ type: "inauguracion", title: "x".repeat(301) });
  assert.match(checkFlyerParamLengths(tooLong) ?? "", /'title' too long/);

  const unknown = new URLSearchParams({ whatever: "z".repeat(10_000) });
  assert.equal(checkFlyerParamLengths(unknown), null, "unknown params are ignored, not rejected");
});
