import type { AdminAnalyticsPayload } from "@/lib/adminAnalytics";
import InstagramSummaryBar from "./InstagramSummaryBar";
import InstagramRefreshButton from "./InstagramRefreshButton";
import InstagramPostsTable from "./InstagramPostsTable";

// Sección de Instagram — slimmed 2026-10-25 (admin redesign): the
// engagement chart, the period toggle and the per-type comparison are
// gone. They were built to answer whether the Monday repeat of Sunday's
// post was worth it, and that question ended with the cadence change.
// Since 2026-08-31 every post is one "agenda" carousel, so a per-type
// average compares nothing. What's left: the last 30 days at a glance
// and the post-by-post table.

const DAY_MS = 24 * 60 * 60 * 1000;

export default function InstagramPage({
  instagramPosts,
  instagramAccountSnapshots,
  now,
}: {
  instagramPosts: AdminAnalyticsPayload["instagramPosts"];
  instagramAccountSnapshots: AdminAnalyticsPayload["instagramAccountSnapshots"];
  now: Date;
}) {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const sinceYmd = since.toISOString().slice(0, 10);
  const sorted = [...instagramAccountSnapshots].sort((a, b) => (a.snapshotDate < b.snapshotDate ? -1 : 1));
  const latest = sorted.at(-1) ?? null;
  // The last snapshot on or before 30 days ago is the baseline; with no
  // history that old, there's no delta to show.
  const baseline = [...sorted].reverse().find((s) => s.snapshotDate <= sinceYmd) ?? null;
  const recentPosts = instagramPosts.filter((p) => p.publishedAt >= since.toISOString());
  const sum = (values: (number | null)[]) => values.reduce((acc: number, v) => acc + (v ?? 0), 0);

  return (
    <div className="flex flex-col gap-12">
      <section>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary">Últimos 30 días</h2>
          <InstagramRefreshButton />
        </div>
        <InstagramSummaryBar
          followersCount={latest?.followersCount ?? null}
          followersDelta={latest && baseline ? latest.followersCount - baseline.followersCount : null}
          reachTotal={sum(recentPosts.map((p) => p.reach))}
          likesTotal={sum(recentPosts.map((p) => p.likeCount))}
          savedTotal={sum(recentPosts.map((p) => p.saved))}
        />
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Posts recientes</h2>
        <p className="font-geist text-[14px] text-text-primary/70 mb-4">Post a post, con día de la semana.</p>
        <InstagramPostsTable posts={instagramPosts} />
      </section>
    </div>
  );
}
