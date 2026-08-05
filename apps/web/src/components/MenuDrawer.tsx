"use client";

import { useState } from "react";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import DrawerShell from "./DrawerShell";
import ContactPanel from "./ContactPanel";

interface MenuDrawerProps {
  open: boolean;
  familyMode: boolean;
  onToggleFamilyMode: () => void;
  onClose: () => void;
  // Footer's "Contacto" link opens this drawer straight into the contact
  // view instead of the root menu (see CalendarView.tsx's openContact).
  // Defaults to "menu" — the hamburger button never passes this.
  initialView?: DrawerView;
}

type DrawerView = "menu" | "contact";

// Rediseño 2.0.0 — caldearte-web-menu-v2.0.0 / caldearte-mobile-menu-v2.0.0
// (same layout both breakpoints, just full-width vs. half-width). Two
// in-drawer views: "menu" (root) and "contact" (caldearte-web-contacto-
// v2.0.0 / caldearte-mobile-contacto) — Contacto no longer navigates to
// /contacto, it shows DrawerContactForm right here. Always resets to
// `initialView` on close so reopening never strands a visitor on the
// wrong view. The old "Revisa expos anteriores" archive link is dropped
// entirely (confirmed with the user 2026-08-04) — week navigation +
// search cover that need now.
export default function MenuDrawer({ open, familyMode, onToggleFamilyMode, onClose, initialView = "menu" }: MenuDrawerProps) {
  const [view, setView] = useState<DrawerView>(initialView);
  // Resets to `initialView` the moment `open` goes true — adjusting state
  // during render (React's own recommended pattern for this, see "you
  // might not need an effect") instead of an effect, so reopening via the
  // hamburger after a Footer-triggered "contact" open (or vice versa)
  // never strands a visitor on the wrong view.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setView(initialView);
  }

  // Closes the drawer first, then scrolls once the close transition has
  // actually finished (300ms, matching the panel's own duration-300) —
  // scrolling immediately would fight the drawer's own translate-x
  // animation and read as an abrupt jump instead of one smooth motion.
  function goToNewsletter() {
    onClose();
    setTimeout(() => {
      document.getElementById("newsletter-section")?.scrollIntoView({ behavior: "smooth" });
    }, 300);
  }

  return (
    <DrawerShell open={open} onClose={onClose}>
      {view === "contact" ? (
        <ContactPanel onBack={() => setView("menu")} onClose={onClose} />
      ) : (
        <>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} aria-label={esCL.menuDrawer.closeAriaLabel} className="cursor-pointer">
              {/* eslint-disable-next-line @next/next/no-img-element -- hand-drawn, see ContactPanel's own comment */}
              <img src="/icons/close-x.svg" alt="" width={50} height={50} />
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleFamilyMode}
            aria-pressed={familyMode}
            className="self-center flex items-center gap-[10px] py-[24px] md:pt-[50px] cursor-pointer"
          >
            <span className="font-fragment-mono text-[16px] uppercase">{esCL.familyMode}</span>
            <span className="relative w-[52px] h-[32px] rounded-full border-2 border-surface-sage shrink-0">
              <span
                className={`absolute top-1/2 -translate-y-1/2 size-[16px] rounded-full bg-surface-sage transition-all ${
                  familyMode ? "left-[28px]" : "left-[6px]"
                }`}
              />
            </span>
          </button>

          {/* Exact desktop measurements from Figma (187:694, 520x386 row
              at the 640px drawer width): CURATORIA 340x386, GUIA DE ARTE
              170x237 top-aligned, CONTACTO 170x84 right under it — the
              right column does NOT stretch to match CURATORIA's height,
              it sits at the top with empty space below, same as Figma. */}
          <div className="flex flex-col md:flex-row gap-[12px] md:gap-[10px] py-6">
            <Link
              href="/curatoria"
              onClick={onClose}
              className="relative w-full md:w-[340px] h-[218px] md:h-[420px] shrink-0 bg-brand-magenta overflow-hidden flex flex-row items-start justify-between md:flex-col md:justify-end p-[24px] md:p-[40px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img src="/icons/curatoria-head.svg" alt="" width={112} className="mb-[16px] scale-x-[-1]" />
              <h3 className="font-lato font-black leading-[0.95] text-surface-sage text-[58px] md:text-[70px]">
                {esCL.curatoriaWordmarkLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </h3>
            </Link>

            <div className="flex flex-row md:flex-col gap-[12px] md:gap-[10px] md:w-[170px]">
              <button
                type="button"
                onClick={goToNewsletter}
                className="relative flex-1 md:flex-none md:w-[170px] h-[197px] md:h-[203px] bg-surface-sage overflow-hidden flex flex-col justify-start p-[16px] md:p-[20px] text-left cursor-pointer"
              >
                <h3 className="font-lato font-black leading-[0.95] text-text-primary text-[59px] md:text-[53px]">
                  {esCL.menuDrawer.guiaDeArteWordmarkLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </h3>
                {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
                <img
                  src="/icons/curatoria-book.svg"
                  alt=""
                  className="md:w-[75px] w-[70px] absolute top-[59px] right-[21px] md:top-[52px] md:right-[8px]"
                />
              </button>

              <button
                type="button"
                onClick={() => setView("contact")}
                className="flex-1 md:flex-none md:w-[170px] h-[84px] flex flex-col items-left justify-center cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
                <img src="/icons/drawer-envelope.svg" alt="" width={100} />
                <span className="self-start ml-[5px] font-fragment-mono text-[16px] text-surface-sage">
                  {esCL.menuDrawer.contactoLabel}
                </span>
              </button>
            </div>
          </div>

          <p className="text-center">
            <Link href="/privacidad" onClick={onClose} className="font-fragment-mono text-[16px] text-surface-sage uppercase">
              {esCL.footer.privacidad}
            </Link>
          </p>
        </>
      )}
    </DrawerShell>
  );
}
