import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

// Home section that speaks to venues, not visitors — see the
// espaciosSection copy's own comment in es-CL.ts for why it exists. Sits
// between the AI disclaimer and NewsletterSection: the visitor-facing
// ask (subscribe) and the venue-facing ask (submit) are back to back at
// the end of the page, each in its own surface. Server component — no
// state, one link.
export default function EspaciosSection() {
  return (
    <section
      id="espacios-section"
      className="bg-surface-sage border-t-4 border-text-primary px-5 md:px-[263px] py-12 md:py-[120px] flex flex-col gap-8 md:gap-[48px]"
    >
      <h2 className="font-lato font-black leading-none text-text-primary text-[56px] md:text-[96px]">
        {esCL.espaciosSection.headlinePlainStart}
        <span className="text-brand-magenta">{esCL.espaciosSection.headlineHighlight}</span>
        {esCL.espaciosSection.headlinePlainEnd}
      </h2>
      <p className="font-lato font-semibold text-[18px] md:text-[24px] text-text-primary max-w-[754px]">{esCL.espaciosSection.body}</p>
      <div>
        <Link
          href="/agrega-tu-expo"
          className="inline-block rounded-button md:rounded-[75px] border-4 md:border-6 border-text-primary bg-text-primary text-surface-sage font-lato font-black text-[28px] md:text-[32px] px-6 md:px-[32px] py-[16px] transition-colors hover:bg-brand-magenta hover:border-brand-magenta hover:text-white"
        >
          {esCL.espaciosSection.cta}
        </Link>
      </div>
    </section>
  );
}
