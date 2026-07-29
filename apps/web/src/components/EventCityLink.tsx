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
      className="inline-flex items-center gap-1.5 bg-city-pill-bg text-city-pill-fg rounded-lg px-3 py-1.5 text-sm shrink-0"
    >
      {cityName}
    </button>
  );
}
