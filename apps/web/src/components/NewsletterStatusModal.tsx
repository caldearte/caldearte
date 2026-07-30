"use client";

import { useRouter } from "next/navigation";
import { esCL } from "@/i18n/es-CL";
import { Hero } from "./NewsletterEntryModal";

export type NewsletterStatus = "confirmed" | "already_confirmed" | "unsubscribed" | "already_unsubscribed" | "invalid" | "error";

interface NewsletterStatusModalProps {
  status: NewsletterStatus | null; // null = nothing to show, from page.tsx's ?newsletter= search param
}

// Shown after clicking the confirm/unsubscribe link in a newsletter email —
// those links redirect here (see apps/web/src/app/newsletter/confirmar and
// .../baja, both server components that call the Edge Function then
// `redirect("/?newsletter=<status>")`) rather than rendering their own page,
// so the visitor lands back on the real site instead of a bare status page.
export default function NewsletterStatusModal({ status }: NewsletterStatusModalProps) {
  const router = useRouter();

  if (!status) return null;

  const isUnsubscribeFlow = status === "unsubscribed" || status === "already_unsubscribed";
  // "confirmed" is the one genuinely celebratory outcome (a brand-new
  // subscriber just activated) — every other status (already confirmed,
  // invalid, error, unsubscribed) is informational, so it gets the plain
  // layout NewsletterEntryModal also uses for those cases.
  const isFreshConfirmation = status === "confirmed";
  const title = isFreshConfirmation
    ? esCL.newsletter.confirmar.confirmedTitle
    : isUnsubscribeFlow
      ? esCL.newsletter.baja.title
      : esCL.newsletter.confirmar.title;
  const message =
    status === "confirmed"
      ? esCL.newsletter.confirmar.confirmed
      : status === "already_confirmed"
        ? esCL.newsletter.confirmar.alreadyConfirmed
        : status === "unsubscribed"
          ? esCL.newsletter.baja.unsubscribed
          : status === "already_unsubscribed"
            ? esCL.newsletter.baja.alreadyUnsubscribed
            : status === "invalid"
              ? esCL.newsletter.confirmar.invalid
              : esCL.newsletter.confirmar.error;

  function close() {
    router.replace("/");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={close}
    >
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl overflow-hidden text-center" onClick={(e) => e.stopPropagation()}>
        {isFreshConfirmation && <Hero />}
        <div className="p-6">
          <h2 className="text-lg font-bold text-heading-gray mb-2">{title}</h2>
          <p className="text-sm text-muted-gray mb-5">{message}</p>
          <button onClick={close} className="text-sm font-semibold bg-heading-gray text-white rounded-full px-5 py-2">
            {esCL.newsletter.close}
          </button>
        </div>
      </div>
    </div>
  );
}
