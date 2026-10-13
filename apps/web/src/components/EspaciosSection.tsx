import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

// Home section that speaks to venues, not visitors — see the
// espaciosSection copy's own comment in es-CL.ts for why it exists (two
// venues asked how to submit and never found the footer link; "expos
// enviadas por espacios" is one of /admin's señales de uso). Since
// 2026-10-13 it sits side by side with NewsletterSection (CalendarView) as
// its mirror — two faces of one coin, the venue ask and the visitor ask,
// at the same type scale; its content centered with air around it. Server
// component.
export default function EspaciosSection() {
  return (
    <section
      id="espacios-section"
      aria-labelledby="espacios-title"
      className="h-full bg-surface-white px-[28px] py-[56px] md:px-[48px] md:py-[80px] flex flex-col items-center justify-center text-center gap-[24px] md:gap-[32px]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static icon, drawn to pair with mail.svg */}
      <img src="/icons/framed-art.svg" alt="" width={72} height={72} className="md:w-[88px] md:h-[88px]" />
      <h2 id="espacios-title" className="font-lato font-black leading-none text-text-primary text-[40px] md:text-[56px]">
        {esCL.espaciosSection.headlinePlainStart}
        <span className="text-brand-magenta">{esCL.espaciosSection.headlineHighlight}</span>
        {esCL.espaciosSection.headlinePlainEnd}
      </h2>
      <p className="font-lato font-semibold text-[18px] md:text-[22px] leading-[1.4] text-text-primary max-w-[460px]">{esCL.espaciosSection.body}</p>
      <Link
        href="/agrega-tu-expo"
        className="inline-block rounded-[75px] border-4 border-text-primary bg-text-primary text-surface-sage font-lato font-black text-[22px] md:text-[26px] px-[20px] py-[10px] transition-colors hover:bg-brand-magenta hover:border-brand-magenta hover:text-white"
      >
        {esCL.espaciosSection.cta}
      </Link>
    </section>
  );
}
