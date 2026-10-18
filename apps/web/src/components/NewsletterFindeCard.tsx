"use client";

import { useState, type FormEvent } from "react";
import { esCL } from "@/i18n/es-CL";
import { useNewsletterSubscribe } from "@/lib/useNewsletterSubscribe";
import { shortRegionName } from "@/lib/regionNames";
import { statusBoxClass } from "@/lib/formStatusBox";
import { emailFieldError } from "@/lib/emailFieldError";
import { FIELD_BOX, FIELD_BOX_INVALID } from "./FormField";

// Light text: this card sits on the dark text-primary background.
const STATUS_BOX_SUCCESS = statusBoxClass("success", "text-surface-sage");
const STATUS_BOX_ERROR = statusBoxClass("error", "text-surface-sage");

// Compact newsletter signup (2026-10-16), right after the home's agenda and
// under each event's own card — where a visitor has just seen what's on and
// is deciding, instead of only the full NewsletterSection 11 screens down
// the home on a phone. No signup had come in since the popup was retired
// (2026-08-04). One field: the región is the one the visitor is looking at
// (home) or the event's own (event page), sent as a hidden value with a
// "cambiar" link that swaps in the select. Same submit logic as every other
// form (useNewsletterSubscribe).
export default function NewsletterFindeCard({ adminRegionName = "" }: { adminRegionName?: string }) {
  const { status, regions, handleSubmit } = useNewsletterSubscribe();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [regionError, setRegionError] = useState<string | undefined>();
  const [pickRegion, setPickRegion] = useState(!adminRegionName);

  const regionLabel = adminRegionName ? shortRegionName(adminRegionName) : "";

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const data = new FormData(e.currentTarget);
    const email = ((data.get("email") as string | null) ?? "").trim();
    const region = (data.get("adminRegionName") as string | null) ?? "";
    const badEmail = emailFieldError(email, esCL.newsletter.invalidEmail);
    const badRegion = region ? undefined : esCL.newsletter.noRegion;
    setEmailError(badEmail);
    setRegionError(badRegion);
    if (badRegion) setPickRegion(true);
    if (badEmail || badRegion) {
      e.preventDefault();
      return;
    }
    handleSubmit(e);
  }

  return (
    <section className="w-full rounded-[16px] bg-text-primary text-surface-sage p-[24px] md:p-[40px] flex flex-col lg:flex-row lg:items-center gap-[20px] lg:gap-[48px]">
      <div className="flex flex-col gap-[10px] lg:flex-1">
        <h2 className="font-lato font-black leading-[1.05] text-[26px] md:text-[34px]">
          {esCL.newsletter.findeHeadlinePlain}
          <span className="text-brand-magenta">{esCL.newsletter.findeHeadlineHighlight}</span>
        </h2>
        <p className="font-lato text-[16px] md:text-[18px] leading-snug text-surface-sage/90">{esCL.newsletter.findeBody(regionLabel)}</p>
      </div>

      <div className="lg:flex-1">
        {status === "success" ? (
          <p className={STATUS_BOX_SUCCESS}>{esCL.newsletter.success}</p>
        ) : status === "already_subscribed" ? (
          <p className={STATUS_BOX_SUCCESS}>{esCL.newsletter.alreadySubscribed}</p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[10px]">
            <div className="flex flex-col sm:flex-row gap-[10px]">
              <label htmlFor="nl-finde-email" className="sr-only">
                {esCL.newsletter.emailLabel}
              </label>
              <input
                id="nl-finde-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder={esCL.newsletter.emailPlaceholder}
                onInput={() => setEmailError(undefined)}
                aria-invalid={emailError ? true : undefined}
                className={`${FIELD_BOX} sm:flex-1 ${emailError ? FIELD_BOX_INVALID : ""}`}
              />
              <button
                type="submit"
                disabled={status === "sending"}
                className="shrink-0 h-[48px] cursor-pointer rounded-[75px] bg-brand-magenta text-white font-lato font-black text-[18px] md:text-[20px] px-[24px] transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-60"
              >
                {status === "sending" ? esCL.newsletter.sending : esCL.newsletter.findeSubmit}
              </button>
            </div>
            {emailError && <p className="text-[14px] font-semibold text-red-300">{emailError}</p>}

            {pickRegion ? (
              <div className="relative">
                <label htmlFor="nl-finde-region" className="sr-only">
                  {esCL.newsletter.regionLabel}
                </label>
                {/* Keyed on the loaded list so defaultValue applies once the options exist. */}
                <select
                  key={regions.length}
                  id="nl-finde-region"
                  name="adminRegionName"
                  defaultValue={regions.some((r) => r.name === adminRegionName) ? adminRegionName : ""}
                  onChange={() => setRegionError(undefined)}
                  className={`${FIELD_BOX} ${regionError ? FIELD_BOX_INVALID : ""} appearance-none pr-[40px]`}
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
                {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, same as NewsletterSection */}
                <img src="/icons/chevron-down.svg" alt="" width={20} height={20} className="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2" />
                {regionError && <p className="mt-[6px] text-[14px] font-semibold text-red-300">{regionError}</p>}
              </div>
            ) : (
              <p className="font-geist font-semibold text-[12px] tracking-[1.5px] uppercase text-surface-sage/80">
                <input type="hidden" name="adminRegionName" value={adminRegionName} />
                {esCL.newsletter.findeRegionLine(regionLabel)} ·{" "}
                <button type="button" onClick={() => setPickRegion(true)} className="cursor-pointer underline underline-offset-2 hover:text-brand-magenta">
                  {esCL.newsletter.findeChangeRegion}
                </button>
              </p>
            )}
            {status === "error" && <p className={STATUS_BOX_ERROR}>{esCL.newsletter.error}</p>}
          </form>
        )}
      </div>
    </section>
  );
}
