// Shared email check for the public API routes (contact form, newsletter
// signup, venue submissions) and the forms that post to them.
//
// History: the old per-route /^[^\s@]+@[^\s@]+\.[^\s@]+$/ was flagged by
// CodeQL (js/polynomial-redos, 2026-10-04) — its domain half let `[^\s@]+`
// and `\.` compete for the same dots, so a long run of dots backtracked
// quadratically. Everything here is either a regex with exactly one way to
// match (character classes that exclude the separator) or a plain split, so
// the cost stays linear; the 254-character cap bounds it regardless.
//
// Tightened 2026-10-18 after the first organic newsletter signup came in as
// "ñ…@gmail.com" (the ñ sits next to the l on a Spanish keyboard): the forms
// skip the browser's own type="email" check (noValidate, for per-field
// errors), and the loose shape accepted it, so the row was stored and the
// confirmation email could never arrive. Now: ASCII only, the RFC's plain
// local-part characters, real-looking domain labels and TLD, and the common
// provider/TLD typos rejected with a suggestion. Still not RFC 5322 — quoted
// local parts and internationalized (ñ/tilde) domains are rejected on
// purpose; nobody in the data uses them and most mail servers don't either.

export const EMAIL_MAX_LENGTH = 254;

export type EmailIssue =
  | { kind: "invalid" }
  // ñ, tildes or any other non-ASCII character — the most likely real typo
  // on a Spanish keyboard, worth its own message.
  | { kind: "accent" }
  | { kind: "typo"; suggestion: string };

// RFC 5322 atext, dot-separated: no leading/trailing/double dots.
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[a-z0-9-]{1,63}$/;
const TLD = /^[a-z]{2,24}$/;
const NON_ASCII = /[^\x00-\x7F]/;

// Not real TLDs, all one keystroke away from "com".
const COM_TYPOS = new Set(["con", "cmo", "cpm", "comm", "coom", "vom", "xom", "ocm"]);

// Misspelled provider names → the real one. Only the name is fixed for
// hotmail/outlook/yahoo (they have real country domains: hotmail.cl,
// yahoo.es…); Gmail only exists as gmail.com, so any other TLD is a typo too.
const PROVIDER_TYPOS: Record<string, string> = {
  gmial: "gmail", gamil: "gmail", gmai: "gmail", gmal: "gmail", gnail: "gmail", gmali: "gmail", gmaill: "gmail", gmil: "gmail", gmsil: "gmail",
  hotmial: "hotmail", hotmal: "hotmail", homail: "hotmail", hotmai: "hotmail", hotmil: "hotmail", hotamil: "hotmail", hotnail: "hotmail", hormail: "hotmail",
  outlok: "outlook", outloo: "outlook", otlook: "outlook", outllok: "outlook",
  yaho: "yahoo", yahho: "yahoo", yhoo: "yahoo",
  iclod: "icloud", icoud: "icloud", iclud: "icloud",
};

export function emailIssue(email: string): EmailIssue | null {
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH) return { kind: "invalid" };
  if (NON_ASCII.test(email)) return { kind: "accent" };

  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return { kind: "invalid" };
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();

  if (local.length > 64 || !LOCAL_PART.test(local)) return { kind: "invalid" };

  const labels = domain.split(".");
  if (labels.length < 2) return { kind: "invalid" };
  for (const label of labels) {
    if (!DOMAIN_LABEL.test(label) || label.startsWith("-") || label.endsWith("-")) return { kind: "invalid" };
  }
  const tld = labels[labels.length - 1];
  if (!TLD.test(tld)) return { kind: "invalid" };

  const name = labels[0];
  const fixedName = PROVIDER_TYPOS[name] ?? name;
  let fixedLabels = [fixedName, ...labels.slice(1)];
  if (COM_TYPOS.has(tld)) fixedLabels[fixedLabels.length - 1] = "com";
  if (fixedName === "gmail") fixedLabels = ["gmail", "com"];
  const fixedDomain = fixedLabels.join(".");
  if (fixedDomain !== domain) return { kind: "typo", suggestion: `${local}@${fixedDomain}` };

  return null;
}

export function isValidEmail(email: string): boolean {
  return emailIssue(email) === null;
}
