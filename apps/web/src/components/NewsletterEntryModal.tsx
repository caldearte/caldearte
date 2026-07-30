"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { esCL } from "@/i18n/es-CL";
import { getSupabaseClient } from "@/lib/supabase-client";

type Status = "idle" | "sending" | "success" | "already_subscribed" | "error";

interface AdminRegionOption {
  name: string;
  order: number;
}

interface NewsletterEntryModalProps {
  open: boolean;
  onClose: () => void;
}

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

// Rotating hero — a fresh random order every time this mounts (i.e. every
// time the modal opens, since both callers unmount it while closed), one
// image visible at a time, cross-fading every HERO_ROTATE_MS. Shared by
// both entry points: the first-visit auto-prompt and the Footer's
// "Suscríbete" link both open NewsletterEntryModal (CalendarView.tsx owns
// the open/close state either way), and NewsletterStatusModal reuses it
// for the "confirmed" celebration state.
export function Hero() {
  // Starts in the fixed, unshuffled order (matches what the server
  // rendered) and only randomizes once mounted on the client — shuffling
  // during the initial render itself (e.g. in useState's lazy initializer)
  // produces a different Math.random() result server-side vs. client-side
  // and React flags a hydration mismatch, since both actually render (this
  // modal can auto-open on first load, not just after a click).
  const [order, setOrder] = useState(HERO_IMAGES);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setOrder(shuffle(HERO_IMAGES));
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

export default function NewsletterEntryModal({ open, onClose }: NewsletterEntryModalProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [regions, setRegions] = useState<AdminRegionOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    getSupabaseClient()
      .from("regions_public")
      .select("admin_region_name, admin_region_order")
      .then(({ data }) => {
        if (cancelled || !data) return;
        const seen = new Map<string, number>();
        for (const r of data) {
          if (r.admin_region_name && r.admin_region_order !== null && !seen.has(r.admin_region_name)) {
            seen.set(r.admin_region_name, r.admin_region_order);
          }
        }
        setRegions(Array.from(seen, ([name, order]) => ({ name, order })).sort((a, b) => a.order - b.order));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), adminRegionName: data.get("adminRegionName") }),
      });
      if (!res.ok) throw new Error("subscribe failed");
      const body = (await res.json()) as { status?: string };
      setStatus(body.status === "already_subscribed" ? "already_subscribed" : "success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={esCL.newsletter.entryTitle} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <Hero />
        <div className="p-6">
          {status === "success" ? (
            <>
              <h2 className="text-lg font-bold text-heading-gray mb-2">{esCL.newsletter.entryTitle}</h2>
              <p className="text-sm text-muted-gray mb-5">{esCL.newsletter.success}</p>
              <button onClick={onClose} className="text-sm font-semibold bg-heading-gray text-white rounded-full px-5 py-2">
                {esCL.newsletter.close}
              </button>
            </>
          ) : status === "already_subscribed" ? (
            <>
              <h2 className="text-lg font-bold text-heading-gray mb-2">{esCL.newsletter.entryTitle}</h2>
              <p className="text-sm text-muted-gray mb-5">{esCL.newsletter.alreadySubscribed}</p>
              <button onClick={onClose} className="text-sm font-semibold bg-heading-gray text-white rounded-full px-5 py-2">
                {esCL.newsletter.close}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-heading-gray mb-1">{esCL.newsletter.entryTitle}</h2>
              <p className="text-sm text-muted-gray mb-4">{esCL.newsletter.entrySubtitle}</p>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <input
                  name="email"
                  type="email"
                  required
                  placeholder={esCL.newsletter.emailPlaceholder}
                  className="text-sm px-3 py-2 rounded-lg border border-stone-300 text-heading-gray"
                />
                <select name="adminRegionName" required defaultValue="" className="text-sm px-3 py-2 rounded-lg border border-stone-300 text-heading-gray">
                  <option value="" disabled>
                    {esCL.newsletter.regionPlaceholder}
                  </option>
                  {regions.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="text-sm font-semibold bg-heading-gray text-white rounded-full px-5 py-2 disabled:opacity-60"
                  >
                    {status === "sending" ? esCL.newsletter.sending : esCL.newsletter.submit}
                  </button>
                  <button type="button" onClick={onClose} className="text-sm font-medium text-muted-gray px-3 py-2">
                    {esCL.newsletter.dismiss}
                  </button>
                </div>
                {status === "error" && <p className="text-xs text-red-600">{esCL.newsletter.error}</p>}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
