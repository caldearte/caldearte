"use client";

interface DrawerShellProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

// Rediseño 2.0.0 — the fixed right-side panel chrome shared by MenuDrawer
// and EventPageFooter's own minimal contact drawer (the event detail page
// has no Header/hamburger menu or familyMode concept to reuse MenuDrawer
// itself, but still needs the exact same "Contacto" panel Footer opens
// from the home page). Extracted so a future chrome change (transition
// timing, click-outside behavior) can't silently apply to only one of the
// two.
export default function DrawerShell({ open, onClose, children }: DrawerShellProps) {
  return (
    <>
      {/* Click-outside-to-close catcher — no dimming/opacity per redesign:
          whatever the panel doesn't cover looks exactly like it normally
          does. Sits behind the panel in DOM order, so a click ON the
          panel never reaches this (browsers hit-test the topmost element
          at a point, they don't fall through by z-index). On mobile the
          panel is full-width so there's nothing outside it to click. */}
      <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} onClick={onClose} />

      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full md:w-[60%] md:max-w-[640px] bg-text-primary text-surface-sage flex flex-col overflow-y-auto px-6 md:px-[60px] py-6 md:py-9 transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}
