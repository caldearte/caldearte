import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

// The two-line "CALDE / ARTE." wordmark linking home — the home's top bar
// and the top of every other page (2026-10-12: one logo across the site,
// replacing the one-line "CALDEARTE" the inner pages used). Same as the
// footer's, at top-bar size.
export default function SiteWordmark() {
  return (
    <Link href="/" aria-label={esCL.appName} className="inline-block shrink-0 font-lato font-black leading-none text-brand-magenta text-[32px] md:text-[40px]">
      <span className="block">{esCL.wordmarkLine1}</span>
      <span className="block">{esCL.wordmarkLine2}</span>
    </Link>
  );
}
