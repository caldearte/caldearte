"use client";

import Image from "next/image";
import { esCL } from "@/i18n/es-CL";
import { useNewsletterSubscribe } from "@/lib/useNewsletterSubscribe";
import { shortRegionName } from "@/lib/regionNames";

// Rediseño 2.0.0 — inline newsletter section on the home page (174:2987
// web, 178:161 mobile), distinct from NewsletterEntryModal (the popup —
// still used for the first-visit auto-prompt and the Footer's
// "Suscríbete" link, untouched here). Shares useNewsletterSubscribe so
// both forms hit the same región list/submit logic instead of drifting.
export default function NewsletterSection() {
  const { status, regions, handleSubmit } = useNewsletterSubscribe();

  return (
    <section className="bg-text-placeholder px-5 md:px-[263px] py-12 md:py-[150px] flex flex-col gap-8 md:gap-[100px]">
      <div className="flex flex-col gap-[16px] md:gap-[20px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
        <img src="/icons/mail.svg" alt="" width={120} height={120} />
        <h2 className="font-lato font-black leading-none text-text-primary text-[56px] md:text-[96px]">
          {esCL.newsletter.sectionHeadlinePlainStart}
          <span className="text-brand-magenta">{esCL.newsletter.sectionHeadlineHighlight}</span>
          {esCL.newsletter.sectionHeadlinePlainEnd}
        </h2>
      </div>

      {status === "success" ? (
        <p className="font-lato font-semibold text-[20px] text-text-primary">{esCL.newsletter.success}</p>
      ) : status === "already_subscribed" ? (
        <p className="font-lato font-semibold text-[20px] text-text-primary">{esCL.newsletter.alreadySubscribed}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-[24px] md:gap-[40px]">
          <div className="w-full">
            <input
              name="email"
              type="email"
              required
              placeholder={esCL.newsletter.sectionEmailPlaceholder}
              className="w-full bg-transparent border-b-4 md:border-b-6 border-text-primary rounded-input px-[8px] md:px-[16px] py-[16px] md:py-[20px] font-lato font-semibold text-[16px] md:text-[20px] text-text-primary placeholder:text-text-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3d373d] focus-visible:outline-offset-2"
            />
          </div>
          <div className="flex flex-col md:flex-row gap-[16px] md:gap-[16px] items-stretch">
            <div className="relative flex-1">
              <select
                name="adminRegionName"
                required
                defaultValue=""
                className="appearance-none w-full bg-transparent border-b-4 md:border-b-6 border-text-primary rounded-input px-[8px] md:px-[16px] py-[16px] md:py-[20px] font-lato font-semibold text-[16px] md:text-[20px] text-text-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3d373d] focus-visible:outline-offset-2"
              >
                <option value="" disabled>
                  {esCL.newsletter.regionPlaceholder}
                </option>
                {regions.map((r) => (
                  <option key={r.name} value={r.name}>
                    {shortRegionName(r.name)}
                  </option>
                ))}
              </select>
              {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
              <img
                src="/icons/chevron-down.svg"
                alt=""
                width={20}
                height={20}
                className="pointer-events-none absolute right-[8px] top-1/2 -translate-y-1/2 md:w-[40px] md:h-[40px]"
              />
            </div>
            <button
              type="submit"
              disabled={status === "sending"}
              className="shrink-0 cursor-pointer rounded-button md:rounded-[75px] border-4 md:border-6 border-text-primary bg-text-primary md:bg-transparent text-text-placeholder md:text-text-primary font-lato font-black text-[40px] md:text-[32px] px-6 md:px-[21px] py-[16px] transition-colors md:hover:bg-text-primary md:hover:text-text-placeholder disabled:cursor-default disabled:opacity-60"
            >
              {status === "sending" ? esCL.newsletter.sending : esCL.newsletter.sectionSubmit}
            </button>
          </div>
          {status === "error" && <p className="text-sm text-red-700">{esCL.newsletter.error}</p>}
        </form>
      )}

      <div className="flex flex-col gap-[12px] md:gap-[24px] items-center max-w-[754px] mx-auto w-full">
        <div className="grid grid-cols-2 gap-[8px] md:gap-[10px] w-full">
          <div className="relative aspect-[100/75] md:aspect-[1024/612] rounded-[8px] md:rounded-none overflow-hidden">
            <Image src="/images/newsletter/hero-1.jpg" alt="" fill sizes="400px" className="object-cover" />
          </div>
          <div className="relative aspect-[100/75] md:aspect-[1024/612] rounded-[8px] md:rounded-none overflow-hidden">
            <Image src="/images/newsletter/hero-3.jpg" alt="" fill sizes="400px" className="object-cover" />
          </div>
        </div>
        <p className="font-geist font-semibold text-[15px] text-text-primary tracking-[2px] text-center uppercase">
          {esCL.newsletter.sectionCaption}
        </p>
      </div>
    </section>
  );
}
