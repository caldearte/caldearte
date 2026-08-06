// App Router convention — Next.js wraps page.tsx in a Suspense boundary
// using this as the fallback, shown while the (now fully dynamic, see
// page.tsx's own comment) server data fetch is in flight. Added
// 2026-08-06: without this, a slow fetch just left the PREVIOUS page on
// screen with no visual change, so a click during that window landed on
// stale content and looked like nothing happened — a real bug report.
// Rough shape only (image block + text lines), not a pixel-exact match of
// EventDetailCard — this only needs to signal "loading", not preview the
// real layout.
export default function EventPageLoading() {
  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto animate-pulse">
      <div className="mb-[40px] md:mb-[60px] h-[48px]" aria-hidden="true" />
      <div className="flex flex-col md:flex-row gap-[24px] md:gap-[60px] items-start">
        <div className="w-full md:w-[600px] shrink-0 aspect-[4/3] bg-stone-300/60 rounded-sm" />
        <div className="flex-1 flex flex-col gap-[20px] md:gap-[24px] min-w-0 w-full">
          <div className="flex flex-col gap-[12px] md:gap-[16px]">
            <div className="h-[14px] w-[160px] bg-stone-300/60 rounded-sm" />
            <div className="h-[32px] md:h-[40px] w-full max-w-[420px] bg-stone-300/60 rounded-sm" />
            <div className="h-[16px] w-[220px] bg-stone-300/60 rounded-sm" />
          </div>
          <div className="flex flex-wrap gap-[12px]">
            <div className="h-[42px] w-[140px] bg-stone-300/60 rounded-sm" />
            <div className="h-[42px] w-[140px] bg-stone-300/60 rounded-sm" />
            <div className="h-[42px] w-[110px] bg-stone-300/60 rounded-sm" />
          </div>
          <div className="flex flex-col gap-[10px] w-full">
            <div className="h-[14px] w-full bg-stone-300/60 rounded-sm" />
            <div className="h-[14px] w-full bg-stone-300/60 rounded-sm" />
            <div className="h-[14px] w-3/4 bg-stone-300/60 rounded-sm" />
          </div>
        </div>
      </div>
    </main>
  );
}
