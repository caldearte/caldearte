// Same reason and shape as app/espacios/[slug]/loading.tsx.
export default function ArtistPageLoading() {
  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto animate-pulse">
      <div className="mb-[40px] md:mb-[60px] h-[48px]" aria-hidden="true" />
      <div className="flex flex-col gap-[12px] md:gap-[16px]">
        <div className="h-[40px] md:h-[56px] w-full max-w-[520px] bg-stone-300/60 rounded-sm" />
        <div className="h-[14px] w-[200px] bg-stone-300/60 rounded-sm" />
      </div>
      <div className="mt-12 md:mt-16 grid grid-cols-1 md:grid-cols-4 gap-[20px]">
        <div className="aspect-[347/174] bg-stone-300/60 rounded-sm" />
        <div className="aspect-[347/174] bg-stone-300/60 rounded-sm hidden md:block" />
        <div className="aspect-[347/174] bg-stone-300/60 rounded-sm hidden md:block" />
        <div className="aspect-[347/174] bg-stone-300/60 rounded-sm hidden md:block" />
      </div>
    </main>
  );
}
