// Single, very visible executive line at the TOP of /admin (Daniel's
// explicit request, 2026-08-17: "algo de una sola línea muy visible y
// ejecutivo tipo dashboard") — real cost of the CURRENT period, split
// into effective (billed) and free-tier (Apify's $5/mo, not billed) —
// same real/gratuito distinction CostTable already established, just
// reduced to one line instead of a full table.
export default function CostSummaryLine({ effectiveUsd, freeTierUsd }: { effectiveUsd: number; freeTierUsd: number }) {
  return (
    <div className="flex flex-wrap items-baseline gap-3">
      <span className="font-fragment-mono text-[32px] text-text-primary leading-none">${effectiveUsd.toFixed(2)}</span>
      <span className="font-geist text-[14px] text-text-primary/60">costo efectivo este período</span>
      {freeTierUsd > 0 && (
        <span className="font-geist text-[13px] text-text-primary/40">(+ ${freeTierUsd.toFixed(2)} en capa gratuita, no cobrado)</span>
      )}
    </div>
  );
}
