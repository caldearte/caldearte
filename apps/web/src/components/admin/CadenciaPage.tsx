"use client";

import { useMemo } from "react";
import type { AdminAnalyticsPayload } from "@/lib/adminAnalytics";
import CadenciaSummaryBar, { type CadenciaTier } from "./CadenciaSummaryBar";
import CadenciaSourceList, { type CadenciaSourceRow } from "./CadenciaSourceList";

// Cadencia de TODAS las fuentes brillantes — nueva sección 2026-08-23,
// pedido de Daniel tras bajar el piso de Instagram de 14 a 7 días:
// primero solo mostraba Instagram ("por qué solo Instagram, yo quería
// ver todas"), ahora suma las otras 3 categorías que comparten la misma
// tabla bright_source_fetch_state pero con cadencia FIJA (7 días, sin
// escalada) — sitios web (KNOWN_SOURCES), MAVI (headless) y Google
// Alerts. Solo Instagram tiene cadencia adaptativa real
// (instagram-fetch-state.ts): 7 -> 14 -> 21 -> 28 (tope) -> 182
// (semestral) -> inactiva.
const INSTAGRAM_TIERS: Array<{ key: string; label: string }> = [
  { key: "7", label: "Instagram — semanal (7d)" },
  { key: "14", label: "Instagram — cada 2 semanas (14d)" },
  { key: "21", label: "Instagram — cada 3 semanas (21d)" },
  { key: "28", label: "Instagram — mensual, tope (28d)" },
  { key: "182", label: "Instagram — semestral (182d)" },
  { key: "inactive", label: "Instagram — inactivas" },
];

const FIXED_CATEGORIES: Array<{ key: "bright_source" | "headless" | "google_alerts"; label: string }> = [
  { key: "bright_source", label: "Sitios web — cadencia fija (7d)" },
  { key: "headless", label: "Headless / MAVI — cadencia fija (7d)" },
  { key: "google_alerts", label: "Google Alerts — cadencia fija (7d)" },
];

export default function CadenciaPage({
  instagramSources,
  brightSources,
}: {
  instagramSources: AdminAnalyticsPayload["instagramSources"];
  brightSources: AdminAnalyticsPayload["brightSources"];
}) {
  const bucketed = useMemo(() => {
    const buckets = new Map<string, CadenciaSourceRow[]>([...INSTAGRAM_TIERS, ...FIXED_CATEGORIES].map((t) => [t.key, []]));
    for (const source of instagramSources) {
      const key = source.isInactive ? "inactive" : String(source.intervalDays ?? 7);
      const bucket = buckets.get(key) ?? buckets.get("7")!; // un intervalo fuera de la escalera conocida cae en el piso, no se pierde
      bucket.push({
        label: `@${source.username}`,
        lastFetchedAt: source.lastFetchedAt,
        accepted: source.accepted,
        rejected: source.rejected,
        isInactive: source.isInactive,
        consecutiveZeroYieldAtCap: source.consecutiveZeroYieldAtCap,
      });
    }
    for (const source of brightSources) {
      const bucket = buckets.get(source.category)!;
      bucket.push({
        label: source.url,
        lastFetchedAt: source.lastFetchedAt,
        accepted: source.accepted,
        rejected: source.rejected,
        isInactive: false,
        consecutiveZeroYieldAtCap: 0,
      });
    }
    return buckets;
  }, [instagramSources, brightSources]);

  const total = instagramSources.length + brightSources.length;
  const tiers: CadenciaTier[] = [
    { key: "total", label: "Total fuentes", count: total },
    ...INSTAGRAM_TIERS.map((t) => ({ key: t.key, label: t.label, count: bucketed.get(t.key)?.length ?? 0 })),
    ...FIXED_CATEGORIES.map((c) => ({ key: c.key, label: c.label, count: bucketed.get(c.key)?.length ?? 0 })),
  ];

  return (
    <div className="flex flex-col gap-12">
      <section>
        <CadenciaSummaryBar tiers={tiers} />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-fragment-mono uppercase text-[16px] text-text-primary/50 mt-2">Instagram — cadencia adaptativa</h2>
        {INSTAGRAM_TIERS.map((tier) => (
          <details key={tier.key} className="border-b border-text-primary/10 pb-4">
            <summary className="cursor-pointer font-fragment-mono uppercase text-[16px] text-text-primary py-2">
              {tier.label} <span className="text-text-primary/50">({bucketed.get(tier.key)?.length ?? 0})</span>
            </summary>
            <div className="mt-2">
              <CadenciaSourceList sources={bucketed.get(tier.key) ?? []} />
            </div>
          </details>
        ))}

        <h2 className="font-fragment-mono uppercase text-[16px] text-text-primary/50 mt-6">Otras fuentes brillantes — cadencia fija</h2>
        {FIXED_CATEGORIES.map((category) => (
          <details key={category.key} className="border-b border-text-primary/10 pb-4">
            <summary className="cursor-pointer font-fragment-mono uppercase text-[16px] text-text-primary py-2">
              {category.label} <span className="text-text-primary/50">({bucketed.get(category.key)?.length ?? 0})</span>
            </summary>
            <div className="mt-2">
              <CadenciaSourceList sources={bucketed.get(category.key) ?? []} />
            </div>
          </details>
        ))}
      </section>

      <section className="border-t border-text-primary/10 pt-8">
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Qué medir a futuro</h2>
        <ul className="font-geist text-[14px] text-text-primary/80 flex flex-col gap-2 list-disc pl-5">
          <li>
            <strong>Costo real por evento aportado</strong>, cruzando esta tabla con Apify (`/admin/costos`) — detecta fuentes caras
            que casi no producen eventos reales.
          </li>
          <li>
            <strong>Reseteos por ruido</strong> (solo Instagram): cuántas veces una cuenta vuelve al piso (7d) por un post nuevo que
            Haiku termina rechazando, no aprobando — si es frecuente, el criterio de &quot;actividad nueva&quot; debería basarse en
            aprobados, no en posts vistos.
          </li>
          <li>
            <strong>Dónde se estabiliza cada cuenta de Instagram con el tiempo</strong> — si la mayoría termina en 28d+ rápido, el
            piso de 7 fue caro sin mucho beneficio real; si muchas se quedan en 7, confirma que valió la pena.
          </li>
          <li>
            <strong>Volumen nacional de inauguraciones por semana</strong>, antes vs. después del cambio de piso (14→7d,
            2026-08-23) — la métrica que originó este ajuste.
          </li>
          <li>
            <strong>Google Alerts sin yield atribuible por dominio</strong> — su calidad se mide a nivel de pipeline completo (una
            sola fuente, muchos dominios distintos), no por fuente individual como el resto; vale la pena revisar si conviene una
            métrica propia más adelante.
          </li>
        </ul>
      </section>
    </div>
  );
}
