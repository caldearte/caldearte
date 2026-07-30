"use client";

import { useEffect, useState, type FormEvent } from "react";
import { esCL } from "@/i18n/es-CL";
import { getSupabaseClient } from "@/lib/supabase-client";

type Status = "idle" | "sending" | "success" | "error";

interface CityOption {
  id: string;
  name: string;
}

// Fetches the comuna list itself (regions_public, anon-readable — same
// view apps/web/src/lib/events.ts's fetchApprovedEvents already reads) so
// the Footer can render this on any page without threading a `regions`
// prop through every call site.
export default function NewsletterSignup() {
  const [status, setStatus] = useState<Status>("idle");
  const [cities, setCities] = useState<CityOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    getSupabaseClient()
      .from("regions_public")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        // Same nullable-view-type caveat as apps/web/src/lib/events.ts's
        // RegionRow — id/name are genuinely not null on the real table.
        if (!cancelled && data) setCities(data as CityOption[]);
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
        body: JSON.stringify({ email: data.get("email"), cityId: data.get("cityId") }),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return <p className="text-xs text-muted-gray">{esCL.newsletter.success}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
      <span className="text-xs font-semibold text-muted-gray sm:self-center">{esCL.newsletter.title}</span>
      <input
        name="email"
        type="email"
        required
        placeholder={esCL.newsletter.emailPlaceholder}
        className="text-xs px-2 py-1.5 rounded-md border border-stone-300 text-heading-gray"
      />
      <select name="cityId" required defaultValue="" className="text-xs px-2 py-1.5 rounded-md border border-stone-300 text-heading-gray">
        <option value="" disabled>
          {esCL.newsletter.cityPlaceholder}
        </option>
        {cities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={status === "sending"}
        className="text-xs px-3 py-1.5 rounded-md bg-heading-gray text-white disabled:opacity-60"
      >
        {status === "sending" ? esCL.newsletter.sending : esCL.newsletter.submit}
      </button>
      {status === "error" && <p className="text-xs text-red-600">{esCL.newsletter.error}</p>}
    </form>
  );
}
