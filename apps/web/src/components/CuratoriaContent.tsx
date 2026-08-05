"use client";

import { useState } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import Footer from "./Footer";
import DrawerShell from "./DrawerShell";
import ContactPanel from "./ContactPanel";

// Rediseño 2.0.0 — /curatoria, the most prominent secondary page (linked
// from both the home's CuratoriaBanner and the menu drawer's own magenta
// tile), so it gets a real hero treatment instead of the plain-text page
// this used to be. Section order is deliberate: the founders' own origin
// story first (the human "why"), then the already-approved curation
// manifesto (the concrete "what" — independent spirit, art beyond el
// oficialismo, no hate speech/proselitism), then a sign-off noting a
// founders' video is coming. Same contact-drawer pattern as
// PrivacidadContent.tsx — one shared `contactOpen` state for both the
// inline prompt and the footer's own "Contacto" link.
export default function CuratoriaContent() {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <Link href="/" className="font-lato font-black leading-none text-brand-magenta text-[28px]">
        {esCL.appName}
      </Link>

      {/* Hero — same magenta + curatoria-head.svg + wordmark language as
          MenuDrawer's own CURATORIA tile, at the site's biggest
          established type scale (matches Header.tsx's home hero and
          CuratoriaBanner's own 96px desktop size — not a new size).
          Height is content-driven (no fixed h-[...]) rather than copying
          the drawer tile's exact px height — that height was tuned for
          the tile's smaller 70px wordmark, and reusing it as-is with this
          bigger 96px hero cropped the icon at the top. */}
      <div className="relative w-full bg-brand-magenta flex flex-col justify-end p-[24px] md:p-[60px] mt-[40px] md:mt-[60px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
        <img src="/icons/curatoria-head.svg" alt="" width={112} className="mb-[16px] scale-x-[-1]" />
        <h1 className="font-lato font-black leading-[0.95] text-surface-sage text-[48px] md:text-[96px]">
          {esCL.curatoriaWordmarkLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
      </div>

      <div className="max-w-[720px] flex flex-col gap-[48px] mt-[40px] md:mt-[60px]">
        <section>
          <p className="font-fragment-mono font-bold text-[14px] uppercase text-text-primary mb-[16px]">
            {esCL.curatoriaPage.historyLabel}
          </p>
          <p className="font-geist text-[16px] md:text-[17px] leading-[1.7] text-text-primary whitespace-pre-line">
            {esCL.curatoriaPage.historyText}
          </p>
        </section>

        <section>
          <p className="font-fragment-mono font-bold text-[14px] uppercase text-text-primary mb-[16px]">
            {esCL.curatoriaPage.manifestoLabel}
          </p>
          <p className="font-geist text-[16px] md:text-[17px] leading-[1.7] text-text-primary">{esCL.curatoriaText}</p>
        </section>

        <section>
          <p className="font-geist text-[16px] md:text-[17px] leading-[1.7] text-text-primary">{esCL.curatoriaPage.founderSignature}</p>
          <p className="font-fragment-mono uppercase text-[12px] text-brand-magenta mt-[8px]">{esCL.curatoriaPage.videoComingSoon}</p>
        </section>

        <section>
          <p className="font-fragment-mono font-bold text-[14px] uppercase text-text-primary mb-[16px]">{esCL.contactPrompt.title}</p>
          <p className="font-geist text-[15px] md:text-[16px] leading-[1.6] text-text-primary">
            {esCL.contactPrompt.body}
            <button type="button" onClick={() => setContactOpen(true)} className="underline cursor-pointer">
              {esCL.contactPrompt.linkLabel}
            </button>
            .
          </p>
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
