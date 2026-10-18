import { esCL } from "@/i18n/es-CL";
import { emailIssue } from "./email";

// The error to show under an email field, or undefined when it's fine.
// `invalid` is each form's own generic message (they differ in wording).
export function emailFieldError(email: string, invalid: string): string | undefined {
  const issue = emailIssue(email);
  if (!issue) return undefined;
  if (issue.kind === "accent") return esCL.emailIssue.accent;
  if (issue.kind === "typo") return esCL.emailIssue.typo(issue.suggestion);
  return invalid;
}
