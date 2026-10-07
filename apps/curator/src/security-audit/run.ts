// Weekly (Tuesday) repo/project security audit — see this file's PR for
// the original request: Daniel wanted a recurring check for exposed
// secrets/PII and related security issues, with an email summary instead
// of having to remember to look. Deliberately deterministic/regex-based
// (scan.ts) rather than an LLM pass — no Anthropic cost, no risk of an
// LLM missing or hallucinating a finding, and secrets/PII have a
// recognizable SHAPE that regex handles well.
//
// GitHub's own secret scanning + Dependabot alerts are free for public
// repos but are a security SETTING (Settings -> Code security) — not
// something this script can enable on its own. This script queries
// them best-effort; with the default GITHUB_TOKEN the read is usually
// denied, so the email says "couldn't determine" rather than guessing.
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { scanForSecrets, scanForPii, parsePnpmAudit, type SecretFinding, type PiiFinding, type DependencyFinding } from "./scan.js";
import { sendSecurityAuditEmail, type SecurityAuditSummary } from "../lib/notify.js";

const REPO_ROOT = join(import.meta.dirname, "../../../..");

// Skip binary/asset extensions outright — grepping them wastes time and
// can't contain a real text secret anyway.
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".pdf", ".svg",
]);

function listTrackedFiles(): string[] {
  const output = execSync("git ls-files", { cwd: REPO_ROOT, encoding: "utf8" });
  return output
    .split("\n")
    .filter(Boolean)
    .filter((path) => !BINARY_EXTENSIONS.has(path.slice(path.lastIndexOf("."))));
}

function readTrackedFiles(paths: string[]): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  for (const path of paths) {
    const fullPath = join(REPO_ROOT, path);
    try {
      // Skip anything unexpectedly large (e.g. a committed data dump) —
      // not what this audit is looking for, and slow to regex-scan line
      // by line for no benefit.
      if (statSync(fullPath).size > 2_000_000) continue;
      files.push({ path, content: readFileSync(fullPath, "utf8") });
    } catch {
      // Deleted-but-still-tracked-in-index edge case, or genuinely
      // binary content that fails utf8 decoding — skip either way.
    }
  }
  return files;
}

function runPnpmAudit(): DependencyFinding[] {
  try {
    // pnpm audit exits non-zero when it finds vulnerabilities — that's
    // the expected/common case here, not a real failure, so read stdout
    // from the error object rather than treating a non-zero exit as
    // "the scan itself failed."
    const raw = execSync("pnpm audit --json", { cwd: REPO_ROOT, encoding: "utf8" });
    return parsePnpmAudit(raw);
  } catch (err) {
    const stdout = (err as { stdout?: string }).stdout;
    if (stdout) return parsePnpmAudit(stdout);
    console.error(`[security-audit] pnpm audit failed to run: ${(err as Error).message}`);
    return [];
  }
}

interface GitHubSecurityFeatureStatus {
  secretScanningEnabled: boolean | null; // null = couldn't determine (missing token/permissions)
  openSecretScanningAlerts: number | null;
  dependabotAlertsEnabled: boolean | null;
  openDependabotAlerts: number | null;
}

async function checkGitHubSecurityFeatures(): Promise<GitHubSecurityFeatureStatus> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const result: GitHubSecurityFeatureStatus = {
    secretScanningEnabled: null,
    openSecretScanningAlerts: null,
    dependabotAlertsEnabled: null,
    openDependabotAlerts: null,
  };
  if (!token || !repo) return result;

  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };

  const secretScanning = await fetch(`https://api.github.com/repos/${repo}/secret-scanning/alerts?state=open`, { headers });
  // 403/404 are ambiguous here: the workflow's GITHUB_TOKEN can't read
  // these alerts even when the feature is on (Dependabot reported "off"
  // while enabled, 2026-10-06), so only a successful read counts as a
  // known state; anything else stays null ("couldn't determine").
  if (secretScanning.ok) {
    result.secretScanningEnabled = true;
    result.openSecretScanningAlerts = ((await secretScanning.json()) as unknown[]).length;
  }

  const dependabot = await fetch(`https://api.github.com/repos/${repo}/dependabot/alerts?state=open`, { headers });
  if (dependabot.ok) {
    result.dependabotAlertsEnabled = true;
    result.openDependabotAlerts = ((await dependabot.json()) as unknown[]).length;
  }

  return result;
}

export async function run(): Promise<void> {
  console.log("[security-audit] listing tracked files…");
  const paths = listTrackedFiles();
  const files = readTrackedFiles(paths);
  console.log(`[security-audit] scanning ${files.length} file(s)…`);

  const secrets: SecretFinding[] = scanForSecrets(files);
  const pii: PiiFinding[] = scanForPii(files);

  console.log("[security-audit] running pnpm audit…");
  const dependencies = runPnpmAudit();

  console.log("[security-audit] checking GitHub secret scanning / Dependabot status…");
  const githubFeatures = await checkGitHubSecurityFeatures();

  const summary: SecurityAuditSummary = {
    startedAt: new Date(),
    filesScanned: files.length,
    secrets,
    pii,
    dependencies,
    githubFeatures,
  };

  console.log(
    `[security-audit] done — ${secrets.length} secret finding(s), ${pii.length} PII finding(s), ${dependencies.length} dependency vulnerability(ies).`,
  );

  await sendSecurityAuditEmail(summary);
}
