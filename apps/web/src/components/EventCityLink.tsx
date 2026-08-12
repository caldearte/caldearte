"use client";

import { useRouter } from "next/navigation";
import { REGION_COOKIE, setCookie } from "@/lib/cookies";

interface EventCityLinkProps {
  regionId: string; // this event's own admin región — what actually gets selected
  cityName: string; // this event's own comuna — still shown, just not what's selected anymore
}

// Sets the same REGION_COOKIE the homepage's own picker writes
// (CalendarView.tsx), then navigates home — the event detail page has no
// calendar data of its own to re-render in place, so there's no
// router.refresh()-in-place option here, just a real navigation. Shows the
// event's own specific comuna name (still a nice, specific detail worth
// keeping), but selects its whole región — región is the only selection
// unit anywhere in the app now (2026-08-12).
export default function EventCityLink({ regionId, cityName }: EventCityLinkProps) {
  const router = useRouter();

  function goToRegion() {
    setCookie(REGION_COOKIE, regionId);
    router.push("/");
  }

  return (
    <button
      onClick={goToRegion}
      className="inline-flex items-center gap-[9px] border border-border-default rounded-[9px] px-[16px] py-[10px] shrink-0 cursor-pointer"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
      <img src="/icons/location-pin.svg" alt="" width={12} height={16} className="shrink-0" />
      <span className="font-fragment-mono text-[14px] text-border-default uppercase whitespace-nowrap">{cityName}</span>
    </button>
  );
}
