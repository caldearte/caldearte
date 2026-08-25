"use client";

import { esCL } from "@/i18n/es-CL";
import { useRefreshInstagramInsights } from "@/lib/useRefreshInstagramInsights";

// /admin/instagram, next to InstagramSummaryBar — Daniel 2026-08-25
// asked why the follower count wasn't live; the real answer is it's a
// weekly snapshot (instagram-insights.yml). Rather than making the page
// call Instagram's Graph API live on every load (a new secret shared
// with the web app, plus real added latency for a number that barely
// moves), this triggers the same cron on demand instead.
export default function InstagramRefreshButton() {
  const { status, refresh } = useRefreshInstagramInsights();

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={refresh}
        disabled={status === "loading"}
        className="font-fragment-mono uppercase text-[12px] px-3 py-1.5 rounded-sm border border-text-primary/30 text-text-primary bg-transparent hover:border-text-primary/60 transition-colors disabled:opacity-50"
      >
        {status === "loading" ? esCL.instagramRefreshing : esCL.instagramRefreshButton}
      </button>
      {status === "dispatched" && <p className="font-geist text-[13px] text-text-primary/70">{esCL.instagramRefreshSuccess}</p>}
      {status === "error" && <p className="font-geist text-[13px] text-red-600">{esCL.instagramRefreshError}</p>}
    </div>
  );
}
