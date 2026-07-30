import Link from "next/link";
import { esCL } from "@/i18n/es-CL";
import NewsletterSignup from "./NewsletterSignup";

export default function Footer() {
  return (
    <footer className="mt-16 pt-6 border-t border-stone-200 flex flex-col gap-6">
      <NewsletterSignup />
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
