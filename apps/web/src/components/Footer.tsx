import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

interface FooterProps {
  // Opens NewsletterEntryModal in place (CalendarView.tsx owns the state).
  // Omitted on pages that don't render that modal (eventos/[id]) — the
  // link falls back to a real navigation that opens it on arrival, see
  // page.tsx's `suscribir` search param.
  onOpenNewsletter?: () => void;
}

export default function Footer({ onOpenNewsletter }: FooterProps) {
  return (
    <footer className="mt-16 pt-6 border-t border-stone-200 flex flex-col gap-4">
      {onOpenNewsletter ? (
        <button onClick={onOpenNewsletter} className="self-start text-sm font-semibold text-heading-gray underline">
          {esCL.newsletter.footerLink}
        </button>
      ) : (
        <Link href="/?suscribir=1" className="self-start text-sm font-semibold text-heading-gray underline">
          {esCL.newsletter.footerLink}
        </Link>
      )}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-base font-bold text-heading-gray">{esCL.appName}</p>
          <p className="text-xs text-muted-gray mt-1">{esCL.footer.copyright(new Date().getFullYear())}</p>
        </div>
        <div className="flex gap-6 text-xs text-muted-gray">
          <Link href="/contacto">{esCL.footer.contacto}</Link>
          <Link href="/privacidad">{esCL.footer.privacidad}</Link>
        </div>
      </div>
    </footer>
  );
}
