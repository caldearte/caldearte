"use client";

import { esCL } from "@/i18n/es-CL";
import { useNewsletterSubscribe } from "@/lib/useNewsletterSubscribe";
import { shortRegionName } from "@/lib/regionNames";
import { statusBoxClass } from "@/lib/formStatusBox";

const STATUS_BOX_SUCCESS = statusBoxClass("success", "text-text-primary");
const STATUS_BOX_ERROR = statusBoxClass("error", "text-text-primary");

interface NewsletterSectionProps {
  // The región the visitor is looking at, preselected in the form — they
  // almost always want the newsletter for the same place.
  adminRegionName: string;
}

// The newsletter ask as a compact strip right after the week's agenda
// (2026-10-12) — the moment "I want this every week" makes sense — instead
// of a ~700px block at the very end of the page. Same form and endpoint
// (useNewsletterSubscribe), it's the only subscription form on the site.
export default function NewsletterSection({ adminRegionName }: NewsletterSectionProps) {
  const { status, regions, handleSubmit } = useNewsletterSubscribe();
  const field =
    "h-[44px] bg-surface-white border border-text-primary/20 rounded-input px-[12px] font-geist text-[15px] text-text-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-text-primary";

  return (
    <section id="newsletter-section" aria-labelledby="newsletter-title" className="mt-[40px] border-y-2 border-text-primary py-[24px] md:py-[28px]">
      <div className="flex flex-col md:flex-row md:items-end gap-[16px] md:gap-[32px]">
        <div className="md:w-[280px] shrink-0">
          <h2 id="newsletter-title" className="font-lato font-black text-[24px] leading-[1.1] text-text-primary">
            {esCL.home.newsletterTitle}
          </h2>
          <p className="font-geist text-[14px] text-text-secondary mt-[6px]">{esCL.home.newsletterBody}</p>
        </div>

        {status === "success" ? (
          <p className={STATUS_BOX_SUCCESS}>{esCL.newsletter.success}</p>
        ) : status === "already_subscribed" ? (
          <p className={STATUS_BOX_SUCCESS}>{esCL.newsletter.alreadySubscribed}</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-[10px]">
            <div className="flex flex-col sm:flex-row gap-[10px]">
              <input name="email" type="email" required placeholder={esCL.newsletter.sectionEmailPlaceholder} aria-label={esCL.newsletter.sectionEmailPlaceholder} className={`${field} w-full sm:flex-1 min-w-0`} />
              {/* Keyed on the loaded list so defaultValue applies once the
                  options exist (they load client-side). */}
              <select
                key={regions.length}
                name="adminRegionName"
                required
                defaultValue={regions.some((r) => r.name === adminRegionName) ? adminRegionName : ""}
                aria-label={esCL.newsletter.regionPlaceholder}
                className={`${field} sm:w-[180px]`}
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
              <button
                type="submit"
                disabled={status === "sending"}
                className="h-[44px] shrink-0 px-[20px] rounded-input bg-text-primary text-surface-sage font-geist font-semibold text-[15px] cursor-pointer hover:bg-brand-magenta hover:text-white disabled:opacity-60 disabled:cursor-default"
              >
                {status === "sending" ? esCL.newsletter.sending : esCL.home.newsletterSubmit}
              </button>
            </div>
            {status === "error" && <p className={STATUS_BOX_ERROR}>{esCL.newsletter.error}</p>}
          </form>
        )}
      </div>
    </section>
  );
}
