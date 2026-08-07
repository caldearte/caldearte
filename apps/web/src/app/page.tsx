import { Suspense } from "react";
import { EMPTY_COOKIE_READER } from "@/lib/cityPickerContext";
import { computeHomeViewModel } from "@/lib/homeViewModel";
import CalendarView from "@/components/CalendarView";
import HomeClient from "@/components/HomeClient";

// Cache-eligible on purpose (2026-08-06, fixing a real Fast Origin
// Transfer spike — see docs/architecture.md): this Server Component calls
// NEITHER cookies()/headers() NOR reads `searchParams` — either one would
// force Next.js to render this page fresh, from scratch, on every single
// request, which is exactly what was driving the spike at real traffic
// volume (84K uncached requests to this route in the period that tripped
// Vercel's usage warning). It computes ONE default view (Santiago,
// current week, family mode on — the same fallback every first-time
// visitor without any cookies already gets today) and lets Next.js serve
// that from cache/ISR (see `revalidate` below) to most visitors.
//
// Personalization (a returning visitor's own city, family-mode-off,
// ?semana=/?newsletter= deep links) moves to the client: HomeClient.tsx
// reads the visitor's real cookies/URL params after the cached HTML has
// already loaded and, only when something differs from this default,
// fetches /api/home-data (which DOES read real cookies()/headers(), same
// computation, just as a small JSON response instead of a full page) and
// swaps in the personalized view. The default here is deliberately the
// SAFEST state (family mode ON), never the reverse, so there's never a
// flash of content that should have been filtered — at worst a visitor
// briefly sees the more-filtered default before their own looser
// preference loads in.
export const revalidate = 60;

export default async function HomePage() {
  const model = await computeHomeViewModel({ cookieStore: EMPTY_COOKIE_READER, headerStore: new Headers() });

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      {/* useSearchParams() inside HomeClient needs a Suspense boundary to
          let Next.js statically prerender this shell and bail out to CSR
          only for that part — without it, the whole page can't be
          statically generated at all (build fails outright). The
          fallback is the exact same default view, just rendered by a
          component that doesn't call useSearchParams — real client
          hydration takes over near-instantly, this isn't a visible
          loading state. */}
      <Suspense fallback={<CalendarView {...model} />}>
        <HomeClient initialModel={model} />
      </Suspense>
    </main>
  );
}
