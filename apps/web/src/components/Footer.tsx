"use client";

import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

interface FooterProps {
  // "Contacto" opens the drawer's own contact view instead of navigating
  // to the now-removed /contacto page — every real caller supplies this
  // (CalendarView.tsx opens its existing MenuDrawer; EventPageFooter.tsx
  // owns a minimal standalone drawer for pages with no MenuDrawer of
  // their own, e.g. /eventos/[id] which has no familyMode concept to
  // reuse MenuDrawer itself).
  onContactClick: () => void;
}

// Rediseño 2.0.0 — footer (178:216), same design for desktop and mobile
// (single Figma group, no separate breakpoint variant). The previous
// "Suscríbete" link is dropped per design — the inline NewsletterSection
// on the home page is now the primary subscribe entry point.
export default function Footer({ onContactClick }: FooterProps) {
  return (
    <footer className="bg-brand-magenta text-surface-sage flex flex-col md:flex-row gap-[24px] px-[60px] py-[80px] md:justify-between">
      <div className="flex flex-col gap-[12px]">
        <p className="font-lato font-black leading-none text-[76px]">
          {esCL.wordmarkLine1}
          <br />
          {esCL.wordmarkLine2}
        </p>
        <p className="font-geist font-bold text-[12px] tracking-[2px] w-[139px] uppercase">
          {esCL.heroTagline}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-[20px] font-fragment-mono text-[14px] md:text-[16px]">
        <button type="button" onClick={onContactClick} className="uppercase cursor-pointer">
          {esCL.footer.contacto}
        </button>
        <Link href="/privacidad" className="uppercase">
          {esCL.footer.privacidad}
        </Link>
        <p>{new Date().getFullYear()}</p>
      </div>
    </footer>
  );
}
