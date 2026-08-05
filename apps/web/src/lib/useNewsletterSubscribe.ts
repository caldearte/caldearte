"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseClient } from "@/lib/supabase-client";

export type NewsletterSubmitStatus = "idle" | "sending" | "success" | "already_subscribed" | "error";

export interface AdminRegionOption {
  name: string;
  order: number;
}

// Shared logic behind every newsletter signup form on the site (the
// NewsletterEntryModal popup and the rediseño 2.0.0 inline home-page
// section) — región options + submit handling extracted here so both
// forms stay in sync instead of maintaining two copies of the same
// fetch/POST logic.
export function useNewsletterSubscribe() {
  const [status, setStatus] = useState<NewsletterSubmitStatus>("idle");
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

  return { status, regions, handleSubmit };
}
