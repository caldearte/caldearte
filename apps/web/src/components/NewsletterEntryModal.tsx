"use client";

import { useEffect, useState, type FormEvent } from "react";
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

// Ad-style hero — a spotlight over an abstract "framed painting" motif,
// pure CSS/SVG rather than a stock or fabricated photo (there's no real
// gallery-opening photo asset in this repo, and inventing one would read
// as a fake credential). Shared by both entry points: the first-visit
// auto-prompt and the Footer's "Suscríbete" link both open this same
// component (CalendarView.tsx owns the open/close state either way).
export function Hero() {
  return (
    <div className="relative h-36 md:h-44 rounded-t-xl overflow-hidden bg-heading-gray">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, rgba(251,191,36,0.35), transparent 60%), linear-gradient(135deg, #1c1c1c 0%, #2a2a2a 100%)",
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-90">
        <div className="w-14 h-20 md:w-16 md:h-24 rounded-sm border-2 border-amber-300/70 bg-gradient-to-br from-amber-200/20 to-rose-300/10" />
        <div className="w-16 h-24 md:w-20 md:h-28 rounded-sm border-2 border-amber-300 bg-gradient-to-br from-amber-300/30 to-sky-300/10 -translate-y-2" />
        <div className="w-14 h-20 md:w-16 md:h-24 rounded-sm border-2 border-amber-300/70 bg-gradient-to-br from-rose-200/20 to-amber-200/10" />
      </div>
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
