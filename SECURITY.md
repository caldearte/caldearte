# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report them privately through GitHub: go to the repository's **Security** tab and choose **Report a vulnerability**, or open [this link](https://github.com/caldearte/caldearte/security/advisories/new) directly. Only the maintainers can see the report.

Please include:

- what is affected (a URL on caldearte.com, an API route, a workflow, a file);
- how to reproduce it;
- what an attacker could do with it.

This is a small, volunteer-run project. A first reply should come within a week, and a fix as soon as possible after the issue is confirmed. Please give us reasonable time to fix it before disclosing anything publicly.

## Scope

In scope:

- the site at `caldearte.com` and its API routes;
- the code in this repository, including the GitHub Actions workflows;
- secrets or personal data accidentally committed to the repository.

Out of scope: denial-of-service and load testing, social engineering, and findings in third-party services we use (Vercel, Supabase, Anthropic, Apify, Meta, Resend). Please report those to the vendor.

## What's already in place

- GitHub secret scanning with push protection, Dependabot alerts and security updates, and CodeQL code scanning.
- A weekly automated audit (`.github/workflows/security-audit.yml`) that scans every tracked file for credential-shaped strings and unexpected personal data, and runs `pnpm audit`.
- The public site reads the database only through column-restricted views. All writes go through server-side code or Edge Functions.
