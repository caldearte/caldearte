"use client";

import { useRouter } from "next/navigation";
import { CITY_COOKIE, setCookie } from "@/lib/cookies";

interface EventCityLinkProps {
  cityId: string;
  cityName: string;
}

// Sets the same CITY_COOKIE the homepage's own city picker writes
// (CalendarView.tsx), then navigates home — the event detail page has no
// calendar data of its own to re-render in place, so there's no
// router.refresh()-in-place option here, just a real navigation.
export default function EventCityLink({ cityId, cityName }: EventCityLinkProps) {
  const router = useRouter();

  function goToCity() {
    setCookie(CITY_COOKIE, cityId);
    router.push("/");
  }

  return (
    <button
      onClick={goToCity}
      className="inline-flex items-center gap-[9px] border border-border-default rounded-[9px] px-[16px] py-[10px] shrink-0 cursor-pointer"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
      <img src="/icons/location-pin.svg" alt="" width={12} height={16} className="shrink-0" />
      <span className="font-fragment-mono text-[14px] text-border-default uppercase whitespace-nowrap">{cityName}</span>
    </button>
  );
}
