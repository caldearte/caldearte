"use client";

import { useState } from "react";
import Footer from "./Footer";
import DrawerShell from "./DrawerShell";
import ContactPanel from "./ContactPanel";

// The event detail page (app/eventos/[id]/page.tsx) is a Server Component
// with no Header/hamburger menu and no familyMode concept (it doesn't
// filter anything, unlike the home page) — so it can't reuse
// CalendarView.tsx's own MenuDrawer instance for Footer's "Contacto"
// link. This owns a minimal standalone drawer just for that, sharing
// DrawerShell/ContactPanel with MenuDrawer so a future contact-flow
// change can't silently miss one of the two. No "back to a fuller menu"
// destination exists here, so the panel's back arrow just closes it —
// same handler as the close button.
// `note` (venue/artist pages, 2026-10-13): "¿Hay un error en esta ficha…?
// Escríbenos." above the footer — "Escríbenos" opens this same contact
// drawer, like the home's Contacto does, instead of pointing down to it.
export default function EventPageFooter({ note }: { note?: { text: string; link: string; after?: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {note && (
        <p className="mb-[40px] max-w-[640px] font-fragment-mono text-[14px] text-text-primary">
          {note.text}{" "}
          <button type="button" onClick={() => setOpen(true)} className="underline cursor-pointer">
            {note.link}
          </button>
          .{note.after ? ` ${note.after}` : ""}
        </p>
      )}
      <Footer onContactClick={() => setOpen(true)} />
      <DrawerShell open={open} onClose={() => setOpen(false)}>
        <ContactPanel onBack={() => setOpen(false)} onClose={() => setOpen(false)} />
      </DrawerShell>
    </>
  );
}
