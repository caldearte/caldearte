// Explicit discovery-pipeline identity, threaded through insertCandidates
// (event-discovery/run.ts) and recordUsage (usage-tracking.ts) so the new
// /admin analytics dashboard can break events/rejections/cost down by
// pipeline. Single source of truth for the literal so it can't drift
// across the 6 call sites that need it (event-discovery/run.ts has two:
// comuna/Tavily search and its own bright-source loop; instagram-
// discovery, google-alerts-discovery, and headless-discovery have one
// each).
export type Pipeline = "comuna_search" | "bright_source" | "instagram" | "google_alerts" | "headless";
