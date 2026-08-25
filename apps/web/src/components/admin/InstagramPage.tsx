"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { bucketLabel, enumeratePeriods, type Granularity } from "@/lib/adminAnalyticsBucketing";
import type { AdminAnalyticsPayload } from "@/lib/adminAnalytics";
import GranularityToggle from "./GranularityToggle";
import InstagramSummaryBar from "./InstagramSummaryBar";
import InstagramRefreshButton from "./InstagramRefreshButton";
import InstagramTypeComparisonTable from "./InstagramTypeComparisonTable";
import InstagramPostsTable from "./InstagramPostsTable";

const ChartLoading = () => <div className="w-full h-[320px] flex items-center justify-center font-geist text-[13px] text-text-primary/50">Cargando gráfico…</div>;
const InstagramEngagementChart = dynamic(() => import("./InstagramEngagementChart"), { ssr: false, loading: ChartLoading });

// Sección dedicada de Instagram (Daniel 2026-08-24) — el resumen rápido
// vive en /admin (InstagramSummaryBar, período actual solamente); acá va
// el detalle histórico con su propio selector de granularidad, mismo
// patrón que /admin/eventos y /admin/fuentes. Motivada por una pregunta
// real: ¿la repetición deliberada de "inauguraciones" el lunes (mismo
// contenido que el domingo) rinde peor por ser tan seguida, o vale la
// pena como recordatorio? InstagramPostsTable (post a post, con día de
// la semana) e InstagramTypeComparisonTable (promedio por tipo) son las
// 2 vistas pensadas específicamente para responder eso con datos reales
// en vez de intuición.
export default function InstagramPage({
  instagramPosts,
  instagramAccountSnapshots,
}: {
  instagramPosts: AdminAnalyticsPayload["instagramPosts"];
  instagramAccountSnapshots: AdminAnalyticsPayload["instagramAccountSnapshots"];
}) {
  const [granularity, setGranularity] = useState<Granularity>("month");

  const { minDate, maxDate } = useMemo(() => {
    const dates = instagramPosts.map((p) => p.publishedAt.slice(0, 10));
    if (dates.length === 0) {
      const today = new Date().toISOString().slice(0, 10);
      return { minDate: today, maxDate: today };
    }
    dates.sort();
    return { minDate: dates[0], maxDate: dates[dates.length - 1] };
  }, [instagramPosts]);

  const periods = useMemo(() => enumeratePeriods(minDate, maxDate, granularity), [minDate, maxDate, granularity]);

  const currentPeriod = bucketLabel(new Date().toISOString().slice(0, 10), granularity);

  const summary = useMemo(() => {
    const sortedSnapshots = [...instagramAccountSnapshots].sort((a, b) => (a.snapshotDate < b.snapshotDate ? 1 : -1));
    const latest = sortedSnapshots[0] ?? null;
    const snapshotsInPeriod = instagramAccountSnapshots
      .filter((s) => granularity !== "total" && bucketLabel(s.snapshotDate, granularity) === currentPeriod)
      .sort((a, b) => (a.snapshotDate < b.snapshotDate ? -1 : 1));
    const earliestInPeriod = snapshotsInPeriod[0] ?? null;
    const followersDelta = latest && earliestInPeriod ? latest.followersCount - earliestInPeriod.followersCount : null;

    const postsThisPeriod = instagramPosts.filter((p) => granularity === "total" || bucketLabel(p.publishedAt, granularity) === currentPeriod);
    const sum = (values: (number | null)[]) => values.reduce((acc: number, v) => acc + (v ?? 0), 0);

    return {
      followersCount: latest?.followersCount ?? null,
      followersDelta,
      reachTotal: sum(postsThisPeriod.map((p) => p.reach)),
      likesTotal: sum(postsThisPeriod.map((p) => p.likeCount)),
      savedTotal: sum(postsThisPeriod.map((p) => p.saved)),
    };
  }, [instagramAccountSnapshots, instagramPosts, currentPeriod, granularity]);

  return (
    <div className="flex flex-col gap-12">
      <GranularityToggle value={granularity} onChange={setGranularity} />

      <section>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary">Resumen del período</h2>
          <InstagramRefreshButton />
        </div>
        <InstagramSummaryBar
          followersCount={summary.followersCount}
          followersDelta={summary.followersDelta}
          reachTotal={summary.reachTotal}
          likesTotal={summary.likesTotal}
          savedTotal={summary.savedTotal}
        />
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Engagement en el tiempo</h2>
        <InstagramEngagementChart posts={instagramPosts} periods={periods} granularity={granularity} />
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Rendimiento por tipo de post</h2>
        <p className="font-geist text-[14px] text-text-primary/70 mb-4">
          Promedio por post, no total — compara si "Inauguración" (el único tipo que se repite en la semana) rinde peor por post
          que los otros dos, que nunca se repiten.
        </p>
        <InstagramTypeComparisonTable posts={instagramPosts} />
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Posts recientes</h2>
        <p className="font-geist text-[14px] text-text-primary/70 mb-4">
          Post a post, con día de la semana — para comparar directamente un domingo de inauguraciones con el lunes que lo repite.
        </p>
        <InstagramPostsTable posts={instagramPosts} />
      </section>
    </div>
  );
}
