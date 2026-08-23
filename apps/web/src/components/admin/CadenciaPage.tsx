"use client";

import { useMemo } from "react";
import type { AdminAnalyticsPayload } from "@/lib/adminAnalytics";
import CadenciaSummaryBar, { type CadenciaTier } from "./CadenciaSummaryBar";
import CadenciaSourceList, { type CadenciaSourceRow } from "./CadenciaSourceList";

// Cadencia adaptativa de Instagram (instagram-fetch-state.ts) — nueva
// sección 2026-08-23, pedido de Daniel tras bajar el piso de 14 a 7 días:
// "cuenta las fuentes en cada cadencia y agrega info de qué tan buena es
// cada una". Ladder real: 7 -> 14 -> 21 -> 28 (tope) -> 182 (semestral) ->
// inactiva. Solo cuentas de Instagram tienen cadencia adaptativa — las
// demás fuentes brillantes usan un intervalo fijo de 7 días, sin tiers
// que mostrar acá.
const TIER_ORDER: Array<{ key: string; label: string; days: number | null }> = [
  { key: "7", label: "Semanal (7d)", days: 7 },
  { key: "14", label: "Cada 2 semanas (14d)", days: 14 },
  { key: "21", label: "Cada 3 semanas (21d)", days: 21 },
  { key: "28", label: "Mensual — tope (28d)", days: 28 },
  { key: "182", label: "Semestral (182d)", days: 182 },
  { key: "inactive", label: "Inactivas", days: null },
];

export default function CadenciaPage({ instagramSources }: { instagramSources: AdminAnalyticsPayload["instagramSources"] }) {
  const bucketed = useMemo(() => {
    const buckets = new Map<string, CadenciaSourceRow[]>(TIER_ORDER.map((t) => [t.key, []]));
    for (const source of instagramSources) {
      const key = source.isInactive ? "inactive" : String(source.intervalDays ?? 7);
      const bucket = buckets.get(key) ?? buckets.get("7")!; // un intervalo fuera de la escalera conocida cae en el piso, no se pierde
      bucket.push({
        username: source.username,
        lastFetchedAt: source.lastFetchedAt,
        accepted: source.accepted,
        rejected: source.rejected,
        isInactive: source.isInactive,
        consecutiveZeroYieldAtCap: source.consecutiveZeroYieldAtCap,
      });
    }
    return buckets;
  }, [instagramSources]);

  const tiers: CadenciaTier[] = TIER_ORDER.map((t) => ({ key: t.key, label: t.label, count: bucketed.get(t.key)?.length ?? 0 }));

  return (
    <div className="flex flex-col gap-12">
      <section>
        <CadenciaSummaryBar tiers={tiers} />
      </section>

      <section className="flex flex-col gap-4">
        {TIER_ORDER.map((tier) => (
          <details key={tier.key} className="border-b border-text-primary/10 pb-4">
            <summary className="cursor-pointer font-fragment-mono uppercase text-[16px] text-text-primary py-2">
              {tier.label} <span className="text-text-primary/50">({bucketed.get(tier.key)?.length ?? 0})</span>
            </summary>
            <div className="mt-2">
              <CadenciaSourceList sources={bucketed.get(tier.key) ?? []} />
            </div>
          </details>
        ))}
      </section>

      <section className="border-t border-text-primary/10 pt-8">
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Qué medir a futuro</h2>
        <ul className="font-geist text-[14px] text-text-primary/80 flex flex-col gap-2 list-disc pl-5">
          <li>
            <strong>Costo real por evento aportado</strong>, cruzando esta tabla con Apify (`/admin/costos`) — detecta cuentas caras
            que casi no producen eventos reales.
          </li>
          <li>
            <strong>Reseteos por ruido</strong>: cuántas veces una cuenta vuelve al piso (7d) por un post nuevo que Haiku termina
            rechazando, no aprobando — si es frecuente, el criterio de &quot;actividad nueva&quot; debería basarse en aprobados, no en
            posts vistos.
          </li>
          <li>
            <strong>Dónde se estabiliza cada cuenta con el tiempo</strong> — si la mayoría termina en 28d+ rápido, el piso de 7 fue
            caro sin mucho beneficio real; si muchas se quedan en 7, confirma que valió la pena.
          </li>
          <li>
            <strong>Volumen nacional de inauguraciones por semana</strong>, antes vs. después del cambio de piso (14→7d,
            2026-08-23) — la métrica que originó este ajuste.
          </li>
        </ul>
      </section>
    </div>
  );
}
