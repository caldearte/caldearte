import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

// Rediseño 2.0.0 — footer (178:216), same design for desktop and mobile
// (single Figma group, no separate breakpoint variant). The previous
// "Suscríbete" link is dropped per design — the inline NewsletterSection
// on the home page is now the primary subscribe entry point.
export default function Footer() {
  return (
    <footer className="bg-brand-magenta text-surface-sage flex flex-col gap-[24px] px-[20px] py-[40px]">
      <div className="flex flex-col gap-[12px]">
        <p className="font-lato font-black leading-none text-[28px]">
          {esCL.wordmarkLine1}
          <br />
          {esCL.wordmarkLine2}
        </p>
        <p className="font-geist font-bold text-[12px] tracking-[2px] w-[139px] uppercase">{esCL.heroTagline}</p>
      </div>
      <div className="flex flex-wrap items-center gap-[20px] font-fragment-mono text-[13px]">
        <Link href="/contacto" className="uppercase">
          {esCL.footer.contacto}
        </Link>
        <Link href="/privacidad" className="uppercase">
          {esCL.footer.privacidad}
        </Link>
        <p>{new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}
