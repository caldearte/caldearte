import { nearestCityIdByCoords } from "./cities";
import type { RegionMeta } from "./events";

// Client-only — requests a fresh geolocation reading. No visible
// permission prompt fires as long as the browser already granted it once
// before (the whole point of most callers: re-checking position without
// re-asking) — but this is also the one shared path for the FIRST-ever
// request (where a real prompt does fire), so `onError` is optional
// rather than always-silent: callers that just want a background refresh
// pass nothing and treat "nothing happened" as expected; callers driving
// a real user-facing action (the consent banner, the picker's manual
// button) pass `onError` to surface a denial/failure.
export function requestPreciseCityId(regions: RegionMeta[], onResolved: (cityId: string) => void, onError?: () => void): void {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    onError?.();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const id = nearestCityIdByCoords(position.coords.latitude, position.coords.longitude, regions);
      if (id) onResolved(id);
      else onError?.();
    },
    () => onError?.(),
    { maximumAge: 5 * 60 * 1000, timeout: 8000 },
  );
}
