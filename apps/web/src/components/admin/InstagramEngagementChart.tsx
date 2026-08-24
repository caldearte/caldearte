"use client";

import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { bucketLabel, formatPeriodLabel, type Granularity } from "@/lib/adminAnalyticsBucketing";

interface InstagramPostRow {
  publishedAt: string;
  reach: number | null;
  saved: number | null;
  likeCount: number | null;
}

// Mismo patrón que CostHistoryChart (áreas superpuestas, no apiladas —
// alcance/me gusta/guardados son series independientes, no partes de un
// total compuesto). Bucketing hecho acá directamente (no via
// sumAmountByPeriod, que solo suma UN campo) porque necesitamos 3 sumas
// distintas por período a la vez.
export default function InstagramEngagementChart({
  posts,
  periods,
  granularity,
}: {
  posts: InstagramPostRow[];
  periods: string[];
  granularity: Granularity;
}) {
  const sums = new Map<string, { reach: number; likes: number; saved: number }>();
  for (const p of posts) {
    const period = bucketLabel(p.publishedAt, granularity);
    const entry = sums.get(period) ?? { reach: 0, likes: 0, saved: 0 };
    entry.reach += p.reach ?? 0;
    entry.likes += p.likeCount ?? 0;
    entry.saved += p.saved ?? 0;
    sums.set(period, entry);
  }

  const rows = periods.map((period) => ({
    label: formatPeriodLabel(period, granularity),
    reach: sums.get(period)?.reach ?? 0,
    likes: sums.get(period)?.likes ?? 0,
    saved: sums.get(period)?.saved ?? 0,
  }));

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#00000015" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey="reach" name="Alcance" stroke="#ff00fb" fill="#ff00fb" fillOpacity={0.3} />
          <Area type="monotone" dataKey="likes" name="Me gusta" stroke="#3d373d" fill="#3d373d" fillOpacity={0.2} />
          <Area type="monotone" dataKey="saved" name="Guardados" stroke="#888888" fill="#888888" fillOpacity={0.2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
