import { NextResponse } from "next/server";
import { auth, isAdminSession } from "@/lib/auth";

const REPO = "caldearte/caldearte";
const WORKFLOW = "instagram-insights.yml";

// Manually fires the same GitHub Actions workflow the weekly cron runs
// (instagram-insights.yml) — Daniel 2026-08-25: the follower count on
// /admin/instagram only updates when that workflow runs, and waiting a
// full week for a fresh number felt wrong. Async by nature: this just
// dispatches the workflow and returns, it doesn't wait for the run to
// finish (that takes ~1-2 min) or for the DB row it eventually writes —
// same posture as the other /api/admin/* routes proxying a privileged
// action, except the privileged action here is a GitHub API call, not a
// Supabase Edge Function, so GITHUB_ACTIONS_TOKEN is a Vercel-only
// secret with no Supabase equivalent.
export async function POST() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) {
    console.error("[admin/refresh-instagram-insights] GITHUB_ACTIONS_TOKEN not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[admin/refresh-instagram-insights] GitHub API responded ${res.status}: ${body}`);
    return NextResponse.json({ error: "github_dispatch_failed" }, { status: 502 });
  }

  return NextResponse.json({ status: "dispatched" });
}
