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
// `revalidate` bumped 60 → 600s on 2026-08-28: fixing the Fast Origin
// Transfer spike by making this route ISR-eligible traded that problem
// for a second real one — ISR Write Units, a separate free-tier quota,
// hit 195,880/200,000 by Aug 27 (Vercel usage dashboard), on a curve that
// only started climbing around Aug 19 with no matching code change to
// this route — real traffic growth, not a regression, is the likely
// driver. Curated content changes at most a few times a day (event
// discovery/curation runs on a multi-day cadence, not per-minute), so a
// 10-minute-stale cache costs nothing real while cutting write volume
// ~10x. `fetchApprovedEvents`'s own unstable_cache (lib/events.ts) was
// bumped the same way, same reasoning — it's the other real write
// source every page that reads events shares.
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
export const revalidate = 600;

export default async function HomePage() {
  const computed = await computeHomeViewModel({ cookieStore: EMPTY_COOKIE_READER, headerStore: new Headers() });
  // Real bug found 2026-08-08: EMPTY_COOKIE_READER means
  // showGeoConsentPrompt always comes back true here (it reads as "cookie
  // absent" for every visitor, cached or not), so the banner flashed on
  // for every single visitor — including ones who'd already answered it —
  // then vanished once HomeClient's personalization fetch loaded the real
  // answer. Forced false in the cached default instead; HomeClient now
  // independently checks the real cookie client-side (not tied to
  // whether a personalization fetch even runs) and flips it on only when
  // it's actually still unanswered.
  const model = { ...computed, showGeoConsentPrompt: false };

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
