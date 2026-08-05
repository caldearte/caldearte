import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import DrawerContactForm from "./DrawerContactForm";

interface ContactPanelProps {
  // MenuDrawer's own instance goes back to the "menu" view; EventPageFooter's
  // standalone drawer has no fuller menu behind it, so its back arrow just
  // closes the panel (same handler as onClose there).
  onBack: () => void;
  onClose: () => void;
}

// Rediseño 2.0.0 — extracted out of MenuDrawer (caldearte-web-contacto-
// v2.0.0 / caldearte-mobile-contacto) so EventPageFooter's own minimal
// drawer can show the exact same contact panel without depending on
// MenuDrawer's familyMode/menu-view plumbing, which the event detail page
// has no use for.
export default function ContactPanel({ onBack, onClose }: ContactPanelProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} aria-label={esCL.menuDrawer.backToMenuAriaLabel} className="shrink-0 cursor-pointer">
          {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
          <img src="/icons/back-arrow-line.svg" alt="" width={160} height={20} />
        </button>
        <button type="button" onClick={onClose} aria-label={esCL.menuDrawer.closeAriaLabel}>
          {/* eslint-disable-next-line @next/next/no-img-element -- hand-drawn: Figma's Code Connect mapping for this icon has no exportable web asset, only an Android Compose snippet */}
          <img src="/icons/close-x.svg" alt="" width={50} height={50} />
        </button>
      </div>

      <div className="flex flex-col gap-[8px] py-[24px]">
        <p className="font-lato font-black leading-none text-[40px] text-brand-magenta">
          {esCL.wordmarkLine1}
          <br />
          {esCL.wordmarkLine2}
        </p>
        <p className="font-geist text-[16px] text-surface-sage/80 max-w-[250px]">{esCL.menuDrawer.contactSubtitle}</p>
      </div>

      <div className="flex-1 flex flex-col py-[24px]">
        <DrawerContactForm />
      </div>

      <p className="text-center pt-6">
        <Link href="/privacidad" onClick={onClose} className="font-fragment-mono text-[16px] text-surface-sage uppercase">
          {esCL.footer.privacidad}
        </Link>
      </p>
    </>
  );
}
