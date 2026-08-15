// "Total" granularity renders as a compact bar summary instead of a
// degenerate one-point area chart — shared by all 4 area-chart sections.
export default function StatBars({ items }: { items: { label: string; value: number; color: string }[] }) {
  if (items.length === 0) {
    return <p className="font-geist text-[14px] text-text-primary/70">Sin datos.</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <div className="flex flex-col gap-2 max-w-[600px]">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-[180px] shrink-0 font-geist text-[13px] text-text-primary truncate">{item.label}</span>
          <div className="flex-1 h-[18px] bg-text-primary/10 rounded-sm overflow-hidden">
            <div className="h-full" style={{ width: `${(item.value / max) * 100}%`, background: item.color }} />
          </div>
          <span className="w-[50px] text-right font-geist text-[13px] text-text-primary">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
