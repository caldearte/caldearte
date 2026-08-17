// Shared across the pipeline comparison table and the fuentes-por-
// pipeline chart — kept in one place so the two never drift.
// comuna_search stays "(inactiva)" in its own label rather than being
// hidden outright — it's apagado a propósito por costo (decisión ya
// tomada, no un bug), pero pipelineComparison always includes a row for
// it regardless of real data (admin-analytics/index.ts iterates the
// fixed PIPELINES list), so a bare "0 aceptados / 0 rechazados" row with
// no explanation would otherwise read as broken (Daniel's explicit
// request, 2026-08-17).
export const PIPELINE_LABELS: Record<string, string> = {
  comuna_search: "Búsqueda por comuna (Tavily) — inactiva",
  bright_source: "Fuentes brillantes (web)",
  instagram: "Instagram",
  google_alerts: "Google Alerts",
  headless: "MAVI (headless)",
};
