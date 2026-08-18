"use client";

import { useState } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import Footer from "./Footer";
import DrawerShell from "./DrawerShell";
import ContactPanel from "./ContactPanel";

// Rediseño 2.0.0 — /curatoria, the most prominent secondary page (linked
// from both the home's CuratoriaBanner and the menu drawer's own magenta
// tile). Curation-policy-only per the user 2026-08-05 (no founder
// biography here — that's a future "Quiénes somos" page, see memory).
// The manifesto copy itself (esCL.curatoriaPage.*) is the user's own
// final editorial text, given verbatim — not to be reworded. Its own
// closing paragraph already contains a natural "escríbenos desde el
// formulario de contacto" reference, so that IS this page's contact
// prompt (no separate generic one below it, unlike PrivacidadContent).
export default function CuratoriaContent() {
  const [contactOpen, setContactOpen] = useState(false);
  const { curatoriaPage: cp } = esCL;

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <Link href="/" className="font-lato font-black leading-none text-brand-magenta text-[28px]">
        {esCL.appName}
      </Link>

      {/* Hero — same magenta + curatoria-head.svg + wordmark language as
          MenuDrawer's own CURATORIA tile, at the site's biggest
          established type scale (matches Header.tsx's home hero and
          CuratoriaBanner's own 96px desktop size — not a new size).
          Height is content-driven (no fixed h-[...]) — a fixed height
          tuned for the drawer tile's smaller 70px wordmark cropped the
          icon here at this bigger 96px size (real bug, found 2026-08-05). */}
      <div className="relative w-full bg-brand-magenta flex flex-col justify-end p-[24px] md:p-[60px] mt-[40px] md:mt-[60px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
        <img src="/icons/curatoria-head.svg" alt="" width={112} height={119} className="mb-[16px] scale-x-[-1]" />
        <h1 className="font-lato font-black leading-[0.95] text-surface-sage text-[48px] md:text-[96px]">
          {esCL.curatoriaWordmarkLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
      </div>

      <div className="max-w-[900px] flex flex-col gap-[56px] mt-[60px] md:mt-[100px]">
        <section>
          <h2 className="font-lato font-black leading-[1.1] text-text-primary text-[28px] md:text-[44px] mb-[24px]">{cp.manifestoTitle}</h2>
          <p className="font-geist font-bold leading-[1.6] text-text-primary text-[17px] md:text-[20px]">{cp.manifestoIntro}</p>
        </section>

        <section>
          <h3 className="font-lato font-black leading-[1.15] text-text-primary text-[24px] md:text-[36px] mb-[20px]">{cp.section1Heading}</h3>
          <p className="font-geist font-bold leading-[1.6] text-text-primary text-[17px] md:text-[20px] mb-[32px]">{cp.section1Intro}</p>
          <ul className="flex flex-col gap-[24px]">
            {cp.criteria.map((item) => (
              <li key={item.label} className="flex gap-[16px]">
                <span className="mt-[8px] size-[10px] shrink-0 bg-brand-magenta" aria-hidden="true" />
                <p className="font-geist font-bold leading-[1.6] text-text-primary text-[17px] md:text-[20px]">
                  <span className="text-brand-magenta">{item.label}</span> {item.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="font-lato font-black leading-[1.15] text-text-primary text-[24px] md:text-[36px] mb-[20px]">{cp.section2Heading}</h3>
          <div className="flex flex-col gap-[24px]">
            <p className="font-geist font-bold leading-[1.6] text-text-primary text-[17px] md:text-[20px]">{cp.section2Body1}</p>
            <p className="font-geist font-bold leading-[1.6] text-text-primary text-[17px] md:text-[20px]">
              {cp.section2Body2Before}
              <button type="button" onClick={() => setContactOpen(true)} className="underline cursor-pointer">
                {cp.section2ContactLinkLabel}
              </button>
              {cp.section2Body2After}
            </p>
            <p className="font-geist font-bold leading-[1.6] text-text-primary text-[17px] md:text-[20px]">{cp.section2Closing}</p>
          </div>
        </section>
      </div>

      <div className="mt-[60px] md:mt-[120px]">
        <Footer onContactClick={() => setContactOpen(true)} />
      </div>

      <DrawerShell open={contactOpen} onClose={() => setContactOpen(false)}>
        <ContactPanel onBack={() => setContactOpen(false)} onClose={() => setContactOpen(false)} />
      </DrawerShell>
    </main>
  );
}
