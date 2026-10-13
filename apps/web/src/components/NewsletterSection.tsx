"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import { esCL } from "@/i18n/es-CL";
import { useNewsletterSubscribe } from "@/lib/useNewsletterSubscribe";
import { shortRegionName } from "@/lib/regionNames";
import { statusBoxClass } from "@/lib/formStatusBox";
import FormField, { FIELD_BOX, FIELD_BOX_INVALID } from "./FormField";

const STATUS_BOX_SUCCESS = statusBoxClass("success", "text-text-primary");
const STATUS_BOX_ERROR = statusBoxClass("error", "text-text-primary");

// Rediseño 2.0.0 — inline newsletter section on the home page (174:2987
// web, 178:161 mobile), distinct from NewsletterEntryModal (the popup —
// still used for the first-visit auto-prompt and the Footer's
// "Suscríbete" link, untouched here). Since 2026-10-13 it sits beside
// EspaciosSection, the same composition scaled down to half the page
// (Daniel: "dos caras de la misma moneda"), with the shared field chrome
// (FormField: white boxes, visible labels, light examples, errors under
// each field) and the visitor's región preselected. Shares useNewsletterSubscribe so
// both forms hit the same región list/submit logic instead of drifting.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface NewsletterSectionProps {
  // The región the visitor is looking at, preselected in the form — they
  // almost always want the newsletter for the same place.
  adminRegionName?: string;
}

export default function NewsletterSection({ adminRegionName = "" }: NewsletterSectionProps) {
  const { status, regions, handleSubmit } = useNewsletterSubscribe();
  const [errors, setErrors] = useState<{ email?: string; adminRegionName?: string }>({});

  function clearError(name: string) {
    setErrors((prev) => (name in prev ? { ...prev, [name]: undefined } : prev));
  }

  // Checks before the shared submit (useNewsletterSubscribe), so each
  // problem shows under its own field instead of the browser's bubble.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const data = new FormData(e.currentTarget);
    const email = ((data.get("email") as string | null) ?? "").trim();
    const region = (data.get("adminRegionName") as string | null) ?? "";
    const next: { email?: string; adminRegionName?: string } = {};
    if (!EMAIL_RE.test(email)) next.email = esCL.newsletter.invalidEmail;
    if (!region) next.adminRegionName = esCL.newsletter.noRegion;
    setErrors(next);
    if (next.email || next.adminRegionName) {
      e.preventDefault();
      return;
    }
    handleSubmit(e);
  }

  return (
    <section
      id="newsletter-section"
      className="h-full bg-text-placeholder p-[28px] md:p-[48px] flex flex-col gap-[28px] md:gap-[36px]"
    >
      <div className="flex flex-col gap-[14px] md:gap-[16px]">
        {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
        <img src="/icons/mail.svg" alt="" width={72} height={72} className="md:w-[88px] md:h-[88px]" />
        <h2 className="font-lato font-black leading-none text-text-primary text-[40px] md:text-[56px]">
          {esCL.newsletter.sectionHeadlinePlainStart}
          <span className="text-brand-magenta">{esCL.newsletter.sectionHeadlineHighlight}</span>
          {esCL.newsletter.sectionHeadlinePlainEnd}
        </h2>
      </div>

      {status === "success" ? (
        <p className={STATUS_BOX_SUCCESS}>{esCL.newsletter.success}</p>
      ) : status === "already_subscribed" ? (
        <p className={STATUS_BOX_SUCCESS}>{esCL.newsletter.alreadySubscribed}</p>
      ) : (
        <form onSubmit={onSubmit} onInput={(e) => clearError((e.target as HTMLInputElement).name)} noValidate className="flex flex-col gap-[16px]">
          <FormField label={esCL.newsletter.emailLabel} htmlFor="nl-email" error={errors.email}>
            <input
              id="nl-email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={esCL.newsletter.emailPlaceholder}
              className={`${FIELD_BOX} ${errors.email ? FIELD_BOX_INVALID : ""}`}
            />
          </FormField>
          <div className="flex flex-col sm:flex-row sm:items-end gap-[12px]">
            <div className="flex-1">
              <FormField label={esCL.newsletter.regionLabel} htmlFor="nl-region" error={errors.adminRegionName}>
                <div className="relative">
                  {/* Keyed on the loaded list so defaultValue (the región the
                      visitor is looking at) applies once the options exist. */}
                  <select
                    key={regions.length}
                    id="nl-region"
                    name="adminRegionName"
                    defaultValue={regions.some((r) => r.name === adminRegionName) ? adminRegionName : ""}
                    className={`${FIELD_BOX} ${errors.adminRegionName ? FIELD_BOX_INVALID : ""} appearance-none pr-[40px]`}
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
                  <img src="/icons/chevron-down.svg" alt="" width={20} height={20} className="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2" />
                </div>
              </FormField>
            </div>
            <button
              type="submit"
              disabled={status === "sending"}
              className="shrink-0 h-[48px] cursor-pointer rounded-[75px] border-4 border-text-primary bg-text-primary text-text-placeholder font-lato font-black text-[20px] md:text-[22px] px-[20px] transition-colors hover:bg-brand-magenta hover:border-brand-magenta hover:text-white disabled:cursor-default disabled:opacity-60"
            >
              {status === "sending" ? esCL.newsletter.sending : esCL.newsletter.sectionSubmit}
            </button>
          </div>
          {status === "error" && <p className={STATUS_BOX_ERROR}>{esCL.newsletter.error}</p>}
        </form>
      )}

      <div className="flex flex-col gap-[10px] md:gap-[14px] items-center w-full mt-auto">
        <div className="grid grid-cols-2 gap-[8px] md:gap-[10px] w-full">
          <div className="relative aspect-[100/75] md:aspect-[1024/612] rounded-[8px] md:rounded-none overflow-hidden">
            <Image src="/images/newsletter/hero-1.jpg" alt="" fill sizes="400px" className="object-cover" />
          </div>
          <div className="relative aspect-[100/75] md:aspect-[1024/612] rounded-[8px] md:rounded-none overflow-hidden">
            <Image src="/images/newsletter/hero-3.jpg" alt="" fill sizes="400px" className="object-cover" />
          </div>
        </div>
        <p className="font-geist font-semibold text-[12px] md:text-[13px] text-text-primary tracking-[2px] text-center uppercase">
          {esCL.newsletter.sectionCaption}
        </p>
      </div>
    </section>
  );
}
