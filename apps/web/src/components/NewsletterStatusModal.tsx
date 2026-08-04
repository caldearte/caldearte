"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { esCL } from "@/i18n/es-CL";

export type NewsletterStatus = "confirmed" | "already_confirmed" | "unsubscribed" | "already_unsubscribed" | "invalid" | "error";

// Three real inauguración photos (provided directly, not stock/generated) —
// gallery openings and the wine-and-conversation side of it, the thing
// meant to make someone want to go. /public/images/newsletter/*.jpg.
const HERO_IMAGES = ["/images/newsletter/hero-1.jpg", "/images/newsletter/hero-2.jpg", "/images/newsletter/hero-3.jpg"];
const HERO_ROTATE_MS = 4000;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Rotating hero for the "confirmed" celebration state — a fresh random
// order every time this mounts, one image visible at a time, cross-fading
// every HERO_ROTATE_MS. Formerly shared with NewsletterEntryModal (removed
// 2026-08-04 — the inline NewsletterSection on the home page is now the
// only subscribe entry point), so this now lives only here.
function Hero() {
  // Starts in the fixed, unshuffled order (matches what the server
  // rendered) and only randomizes once mounted on the client — shuffling
  // during the initial render itself (e.g. in useState's lazy initializer)
  // produces a different Math.random() result server-side vs. client-side
  // and React flags a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  const order = useMemo(() => (mounted ? shuffle(HERO_IMAGES) : HERO_IMAGES), [mounted]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate: this is the standard mount-flag pattern for hydration-safe randomization, no derived-state alternative exists
    setMounted(true);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % order.length), HERO_ROTATE_MS);
    return () => clearInterval(id);
  }, [order.length]);

  return (
    <div className="relative h-48 md:h-60 rounded-t-xl overflow-hidden bg-heading-gray">
      {order.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          sizes="384px"
          priority={i === 0}
          className={`object-cover transition-opacity duration-700 ${i === index ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
    </div>
  );
}

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#ffffffe3] px-4"
      onClick={close}
    >
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl overflow-hidden text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-baseline justify-between px-6 pt-4 pb-2">
          <span className="text-xl font-normal text-heading-gray">{esCL.appName}</span>
          <span className="text-sm text-muted-gray">{esCL.newsletter.headerLabel}</span>
        </div>
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
