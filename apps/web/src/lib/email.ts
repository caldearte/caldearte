// Shared email-shape check for the public API routes (contact form,
// newsletter signup, venue submissions).
//
// Replaces the old per-route /^[^\s@]+@[^\s@]+\.[^\s@]+$/, flagged by
// CodeQL (js/polynomial-redos, 2026-10-04): its domain half let `[^\s@]+`
// and `\.` compete for the same dots, so a long run of dots with no valid
// ending backtracked quadratically, on endpoints anyone can POST to. Here
// each domain label excludes the dot, so there is exactly one way to match
// and the cost stays linear. The 254-character cap is the practical maximum
// length of an email address and bounds the work regardless.
//
// Same deliberately loose shape as before (something@label.label…): this
// filters typos and garbage, it doesn't try to validate RFC 5322.

const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
export const EMAIL_MAX_LENGTH = 254;

export function isValidEmail(email: string): boolean {
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(email);
}
