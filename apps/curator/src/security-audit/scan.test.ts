import { test } from "node:test";
import assert from "node:assert/strict";
import { scanForSecrets, scanForPii, parsePnpmAudit } from "./scan.js";

test("scanForSecrets flags a real AWS access key and redacts it in the excerpt", () => {
  const findings = scanForSecrets([{ path: "src/foo.ts", content: 'const key = "AKIAIOSFODNN7EXAMPLE";' }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].pattern, "AWS access key");
  assert.equal(findings[0].file, "src/foo.ts");
  assert.ok(!findings[0].excerpt.includes("AKIAIOSFODNN7EXAMPLE"), "excerpt must not contain the raw secret");
  assert.ok(findings[0].excerpt.includes("[redacted]"));
});

test("scanForSecrets ignores secret NAME references — this repo's own workflows reference secrets.X constantly and that must not be flagged", () => {
  const findings = scanForSecrets([
    { path: ".github/workflows/foo.yml", content: "SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" },
  ]);
  assert.equal(findings.length, 0);
});

test("scanForSecrets flags a private key block", () => {
  const findings = scanForSecrets([{ path: "id_rsa", content: "-----BEGIN RSA PRIVATE KEY-----\nMIIExyz\n-----END RSA PRIVATE KEY-----" }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].pattern, "Private key block");
});

test("scanForSecrets flags a connection string with an embedded password", () => {
  const findings = scanForSecrets([{ path: ".env.example", content: "DATABASE_URL=postgres://user:hunter2@db.example.com:5432/app" }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].pattern, "Connection string with embedded password");
});

test("scanForSecrets skips excluded paths like pnpm-lock.yaml", () => {
  const findings = scanForSecrets([{ path: "pnpm-lock.yaml", content: "integrity: sha512-AKIAIOSFODNN7EXAMPLEAKIAIOSFODNN7EXAMPLE==" }]);
  assert.equal(findings.length, 0);
});

test("scanForPii flags an email address not on the allowlist", () => {
  const findings = scanForPii([{ path: "docs/foo.md", content: "Contacto: alguien@gmail.com" }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "email");
  assert.equal(findings[0].value, "alguien@gmail.com");
});

test("scanForPii does not flag the already-accepted operational addresses", () => {
  const findings = scanForPii([{ path: "src/lib/notify.ts", content: 'const RUN_SUMMARY_RECIPIENT = "daniel@probablespa.cl"; const from = "contacto@caldearte.com";' }]);
  assert.equal(findings.length, 0);
});

test("scanForPii flags a Chilean phone number", () => {
  const findings = scanForPii([{ path: "docs/foo.md", content: "Llamar al +56 9 1234 5678" }]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "phone");
});

test("parsePnpmAudit extracts moderate+ severity advisories, matching pnpm's real --json shape", () => {
  const raw = JSON.stringify({
    advisories: {
      "123": { module_name: "postcss", severity: "moderate", title: "Some issue", url: "https://example.com/advisory" },
      "456": { module_name: "left-pad", severity: "low", title: "Not relevant", url: "https://example.com/low" },
    },
  });
  const findings = parsePnpmAudit(raw);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].name, "postcss");
  assert.equal(findings[0].severity, "moderate");
});

test("parsePnpmAudit returns an empty list on unparseable input instead of throwing", () => {
  assert.deepEqual(parsePnpmAudit("not json"), []);
});
