interface EventComunaTagProps {
  cityName: string; // the event's own comuna
}

// The event's comuna next to the logo on its ficha — a plain label since
// 2026-10-12 (Daniel). It used to be a button that set the región cookie
// and sent the visitor home; changing week or región now happens only in
// the home's own h1 dropdowns.
export default function EventComunaTag({ cityName }: EventComunaTagProps) {
  return (
    <span className="inline-flex items-center gap-[9px] border border-border-default rounded-[9px] px-[16px] py-[10px] shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
      <img src="/icons/location-pin.svg" alt="" width={12} height={16} className="shrink-0" />
      <span className="font-fragment-mono text-[14px] text-border-default uppercase whitespace-nowrap">{cityName}</span>
    </span>
  );
}
