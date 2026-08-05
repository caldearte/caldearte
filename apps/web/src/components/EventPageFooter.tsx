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
export default function EventPageFooter() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Footer onContactClick={() => setOpen(true)} />
      <DrawerShell open={open} onClose={() => setOpen(false)}>
        <ContactPanel onBack={() => setOpen(false)} onClose={() => setOpen(false)} />
      </DrawerShell>
    </>
  );
}
