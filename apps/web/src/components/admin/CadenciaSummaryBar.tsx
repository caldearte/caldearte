// Big-number tiles per cadence tier — same visual language as
// CostSummaryLine (Daniel: "algo de una sola línea muy visible y
// ejecutivo tipo dashboard"), extended to a row since there are 6 tiers
// instead of 1 number. Order matches the real escalation ladder
// (instagram-fetch-state.ts): 7 -> 14 -> 21 -> 28 -> 182 -> inactiva.
export interface CadenciaTier {
  key: string;
  label: string;
  count: number;
}

export default function CadenciaSummaryBar({ tiers }: { tiers: CadenciaTier[] }) {
  return (
    <div className="flex flex-wrap gap-8">
      {tiers.map((tier) => (
        <div key={tier.key} className="flex flex-col gap-1">
          <span className="font-fragment-mono text-[40px] text-text-primary leading-none">{tier.count}</span>
          <span className="font-geist text-[13px] text-text-primary/60 uppercase tracking-wide">{tier.label}</span>
        </div>
      ))}
    </div>
  );
}
