import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { checkFlyerParamLengths, parsePublicImageUrl, toSatoriPhoto } from "./flyerRequest";

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

test("toSatoriPhoto: re-encodes a WebP as a JPEG of the same size", async () => {
  const webp = await sharp({ create: { width: 12, height: 8, channels: 3, background: "#cc3366" } }).webp().toBuffer();
  const out = await toSatoriPhoto(webp, "image/webp");
  assert.equal(out.contentType, "image/jpeg");
  const meta = await sharp(out.buffer).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, 12);
  assert.equal(meta.height, 8);
});

test("toSatoriPhoto: puts a transparent WebP on white, not black", async () => {
  const webp = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).webp({ lossless: true }).toBuffer();
  const out = await toSatoriPhoto(webp, "image/webp");
  const { data } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 240, `expected a near-white pixel, got ${data[0]}`);
});

test("toSatoriPhoto: leaves formats Satori reads untouched", async () => {
  const jpeg = Buffer.from("not really a jpeg");
  const out = await toSatoriPhoto(jpeg, "image/jpeg");
  assert.equal(out.buffer, jpeg);
  assert.equal(out.contentType, "image/jpeg");
});
