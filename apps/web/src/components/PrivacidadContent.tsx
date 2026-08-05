"use client";

import { useState } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import Footer from "./Footer";
import DrawerShell from "./DrawerShell";
import ContactPanel from "./ContactPanel";

// Rediseño 2.0.0 — /privacidad restyled to match the rest of the site
// (surface-sage page, wordmark header, fragment-mono section labels,
// same body-prose treatment as EventDetailCard's description). Own a
// single contact-drawer instance here (not EventPageFooter's, which
// bundles its own) because BOTH the footer's "Contacto" link AND this
// page's own inline "formulario de contacto" reference need to open the
// exact same panel instead of two independent ones.
export default function PrivacidadContent() {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <Link href="/" className="font-lato font-black leading-none text-brand-magenta text-[28px]">
        {esCL.appName}
      </Link>

      <h1 className="font-lato font-black leading-none text-text-primary text-[36px] md:text-[48px] mt-[40px] md:mt-[60px] mb-[40px] md:mb-[60px]">
        {esCL.privacidad.title}
      </h1>

      <div className="max-w-[720px] flex flex-col gap-[40px]">
        <section>
          <p className="font-fragment-mono font-bold text-[14px] uppercase text-text-primary mb-[16px]">{esCL.privacidad.dataTitle}</p>
          <p className="font-geist text-[15px] md:text-[16px] leading-[1.6] text-text-primary">{esCL.privacidad.dataBody}</p>
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
