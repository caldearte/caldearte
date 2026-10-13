import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

// Home section that speaks to venues, not visitors — see the
// espaciosSection copy's own comment in es-CL.ts for why it exists (two
// venues asked how to submit and never found the footer link; "expos
// enviadas por espacios" is one of /admin's señales de uso). Compact strip
// since the 2026-10-12 home layout, after the cartelera — same ask, a
// fraction of the old 96px-headline block's height. Server component.
export default function EspaciosSection() {
  return (
    <section id="espacios-section" aria-labelledby="espacios-title" className="mt-[48px] bg-surface-white px-[20px] py-[20px] md:px-[28px] md:py-[24px] flex flex-col md:flex-row md:items-center gap-[14px] md:gap-[32px]">
      <div className="flex-1">
        <h2 id="espacios-title" className="font-lato font-black text-[22px] md:text-[24px] leading-[1.1] text-text-primary">
          {esCL.espaciosSection.headlinePlainStart}
          <span className="text-brand-magenta">{esCL.espaciosSection.headlineHighlight}</span>
          {esCL.espaciosSection.headlinePlainEnd}
        </h2>
        <p className="font-geist text-[14px] text-text-secondary mt-[6px] max-w-[560px]">{esCL.espaciosSection.body}</p>
      </div>
      <Link
        href="/agrega-tu-expo"
        className="self-start md:self-auto shrink-0 h-[44px] inline-flex items-center px-[20px] rounded-input bg-text-primary text-surface-sage font-geist font-semibold text-[15px] transition-colors hover:bg-brand-magenta hover:text-white"
      >
        {esCL.espaciosSection.cta}
      </Link>
    </section>
  );
}
