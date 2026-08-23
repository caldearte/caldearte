// Pure scanning logic, separated from run.ts's filesystem/network I/O so
// it's testable against fixture content without touching the real repo.
//
// Deliberately narrow: only credential-SHAPED strings (a real AWS key, a
// real private-key block, a real connection string with embedded
// password), never a generic "KEY=" or "SECRET=" grep — this repo's own
// workflows/docs are full of legitimate secret NAME references
// (`secrets.SUPABASE_SERVICE_ROLE_KEY`) that a generic pattern would
// flag on every single run.

export interface SecretFinding {
  file: string;
  line: number;
  pattern: string;
  excerpt: string;
}

interface ScannedFile {
  path: string;
  content: string;
}

const SECRET_PATTERNS: { name: string; regex: RegExp }[] = [
  { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub token", regex: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: "Anthropic API key", regex: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "OpenAI-style API key", regex: /sk-[A-Za-z0-9]{32,}/ },
  { name: "Google API key", regex: /AIza[0-9A-Za-z_-]{35}/ },
  // Lookbehind is required — a bare `re_[A-Za-z0-9_-]{20,}` matches
  // "re_" as a substring of ordinary words/identifiers (found in
  // practice: "...retire_view..." in a migration filename comment,
  // "measure_before_building..." in a doc — both just happen to contain
  // "re_" followed by 20+ word characters).
  { name: "Resend API key", regex: /(?<![A-Za-z0-9_])re_[A-Za-z0-9_-]{20,}/ },
  { name: "Instagram/Facebook access token", regex: /\b(IGAA|EAA)[A-Za-z0-9]{30,}/ },
  { name: "Private key block", regex: /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: "Connection string with embedded password", regex: /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^:\s/]+:[^@\s/]+@/ },
  { name: "Generic bearer JWT", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

// Paths that legitimately contain lockfile integrity hashes or vendored
// content shaped like the patterns above (pnpm-lock.yaml's "sha512-..."
// fields have tripped a naive base64 scan before) — excluded outright
// rather than tuned around.
const EXCLUDED_PATH_SEGMENTS = ["pnpm-lock.yaml", "node_modules/", ".pnpm-store/", "/dist/", "/.next/"];

export function scanForSecrets(files: ScannedFile[]): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const file of files) {
    if (EXCLUDED_PATH_SEGMENTS.some((segment) => file.path.includes(segment))) continue;
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const { name, regex } of SECRET_PATTERNS) {
        const match = lines[i].match(regex);
        if (match) {
          findings.push({ file: file.path, line: i + 1, pattern: name, excerpt: redact(lines[i], match[0]) });
        }
      }
    }
  }
  return findings;
}

// Shows enough of the line to locate it without echoing the actual
// secret value into the audit email/logs.
function redact(line: string, matched: string): string {
  const trimmed = line.trim();
  const redacted = trimmed.replace(matched, `${matched.slice(0, 4)}…[redacted]`);
  return redacted.length > 160 ? `${redacted.slice(0, 160)}…` : redacted;
}

export interface PiiFinding {
  file: string;
  line: number;
  kind: "email" | "phone";
  value: string;
}

// Known-accepted addresses already deliberately present in the repo
// (RUN_SUMMARY_RECIPIENT in notify.ts, the sending domain's own
// addresses, generated commit trailers if they ever end up in a file) —
// flagging these every week would just be noise.
const ALLOWED_EMAILS = new Set([
  "daniel@probablespa.cl",
  "contacto@caldearte.com",
  "noreply@anthropic.com",
  // Supabase CLI's own default placeholder, present in every
  // `supabase init`-generated config.toml — not a real address.
  "admin@email.com",
]);
const ALLOWED_EMAIL_DOMAINS = ["@caldearte.com", "@resend.dev", "@example.com"];

// TLD restricted to letters (2+) so a version-pinned "name@version"
// string (e.g. package.json's "packageManager": "pnpm@10.33.0") doesn't
// get read as an email — a real TLD is never all-numeric.
const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[A-Za-z]{2,}/g;
const CHILEAN_PHONE_REGEX = /\+?56[\s-]?9[\s-]?\d{4}[\s-]?\d{4}/g;

export function scanForPii(files: ScannedFile[]): PiiFinding[] {
  const findings: PiiFinding[] = [];
  for (const file of files) {
    if (EXCLUDED_PATH_SEGMENTS.some((segment) => file.path.includes(segment))) continue;
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const match of line.matchAll(EMAIL_REGEX)) {
        const email = match[0].toLowerCase();
        if (ALLOWED_EMAILS.has(email) || ALLOWED_EMAIL_DOMAINS.some((domain) => email.endsWith(domain))) continue;
        findings.push({ file: file.path, line: i + 1, kind: "email", value: email });
      }
      for (const match of line.matchAll(CHILEAN_PHONE_REGEX)) {
        findings.push({ file: file.path, line: i + 1, kind: "phone", value: match[0] });
      }
    }
  }
  return findings;
}

export interface DependencyFinding {
  name: string;
  severity: "moderate" | "high" | "critical";
  via: string;
  url: string | null;
}

interface PnpmAuditAdvisory {
  module_name?: string;
  severity?: string;
  title?: string;
  url?: string;
}

interface PnpmAuditJson {
  advisories?: Record<string, PnpmAuditAdvisory>;
}

const RELEVANT_SEVERITIES = new Set(["moderate", "high", "critical"]);

// `pnpm audit --json` output shape — parsed defensively since pnpm has
// changed this format across versions before (npm-audit-compatible
// `advisories` map is the common denominator both old and current pnpm
// versions still emit).
export function parsePnpmAudit(raw: string): DependencyFinding[] {
  let parsed: PnpmAuditJson;
  try {
    parsed = JSON.parse(raw) as PnpmAuditJson;
  } catch {
    return [];
  }
  const advisories = parsed.advisories ?? {};
  return Object.values(advisories)
    .filter((a): a is Required<Pick<PnpmAuditAdvisory, "module_name" | "severity">> & PnpmAuditAdvisory =>
      Boolean(a.module_name && a.severity && RELEVANT_SEVERITIES.has(a.severity)),
    )
    .map((a) => ({
      name: a.module_name!,
      severity: a.severity as DependencyFinding["severity"],
      via: a.title ?? "sin título",
      url: a.url ?? null,
    }));
}
