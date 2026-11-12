import { run } from "./instagram-discovery/run.js";

const summary = await run();

// Fail the workflow run (red in Actions, GitHub's own failure email, and
// cron-watchdog stops counting it as a success) whenever any Apify call
// failed. Real gap found 2026-11-12: APIFY_TOKEN was revoked on Apify's
// side, the run fetched 0 posts, but it still exited 0 — green in
// Actions, so nothing flagged it; the error only lived in
// discovery_run_summaries.raw_summary.apifyError. The summary is already
// recorded by this point, so failing here loses nothing.
if (summary.apifyError) {
  console.error(`[instagram-discovery] Apify fetch failed: ${summary.apifyError}`);
  process.exitCode = 1;
}
