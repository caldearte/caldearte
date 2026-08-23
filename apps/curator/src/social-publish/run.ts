// Instagram automated-post cron (docs/roadmap.md, Fase 4). Runs daily;
// most days it's a no-op — only Sunday (all 3 types) and Monday/
// Wednesday/Friday (one type each) actually publish anything, per the
// cadence design. Wires together the 3 pure selectors
// (./selection.ts), the flyer renderer (apps/web's /api/social/flyer,
// deployed and publicly reachable — Instagram's Graph API fetches
// image_url itself server-side, so no image upload step is needed here),
// the static closing-slide asset, and the Graph API publish flow
// (./instagram.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@caldearte/shared-types";
import { getSupabaseClient } from "../lib/supabase-client.js";
import {
  selectInauguraciones,
  selectNoTeLaPierdas,
  selectDestacada,
  type SocialEvent,
  type SocialPostType,
} from "./selection.js";
import { publishInstagramCarousel, verifyInstagramAccount, type InstagramClientConfig } from "./instagram.js";

const SITE_URL = "https://www.caldearte.com";
const CLOSING_SLIDE_URL = `${SITE_URL}/social/ig-post-cierre.png`;

const CAPTIONS: Record<SocialPostType, string> = {
  inauguracion: "Inauguraciones de esta semana. Desliza para ver todas — el resto de la agenda está en el link de la bio.",
  no_te_la_pierdas: "Últimos días para estas exposiciones. Más info en el link de la bio.",
  destacada: "Algunas exposiciones para visitar esta semana. Toda la agenda en el link de la bio.",
};

type EventRow = Tables<"events">;
type EventWithRegion = EventRow & { comunaName: string | null };

// Same "fixed Monday-Sunday week" convention as newsletter/run.ts and
// apps/web/src/lib/date.ts's weekBoundsInSantiago.
function weekBoundsInSantiago(now: Date): { start: string; end: string } {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);
  const [y, m, d] = todayStr.split("-").map(Number);
  const asUtc = new Date(Date.UTC(y, m - 1, d));
  const dow = asUtc.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(asUtc);
  monday.setUTCDate(asUtc.getUTCDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

function todayInSantiago(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);
}

// Sunday posts all 3 (the week's full plan); Monday/Wednesday/Friday each
// post one — see docs/roadmap.md's cadence table. Every other day is a
// deliberate no-op, not a bug.
function scheduledTypesFor(now: Date): SocialPostType[] {
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", weekday: "short" }).format(now);
  switch (dow) {
    case "Sun":
      return ["inauguracion", "no_te_la_pierdas", "destacada"];
    case "Mon":
      return ["inauguracion"];
    case "Wed":
      return ["no_te_la_pierdas"];
    case "Fri":
      return ["destacada"];
    default:
      return [];
  }
}

function toSocialEvent(e: EventWithRegion): SocialEvent {
  return {
    id: e.id,
    title: e.title,
    artist: e.artist,
    placeName: e.place_name,
    comunaName: e.comunaName,
    imageUrl: e.image_url,
    description: e.description,
    sensitivityTags: e.sensitivity_tags,
    openingDatetime: e.opening_datetime,
    openingTimeConfirmed: e.opening_time_confirmed,
    runStartDate: e.run_start_date,
    runEndDate: e.run_end_date,
  };
}

function buildFlyerUrl(type: SocialPostType, e: SocialEvent, comunaAndRegion: string): string {
  const params = new URLSearchParams({
    type,
    title: e.title,
    location: comunaAndRegion,
    imageUrl: e.imageUrl ?? "",
  });
  if (e.artist) params.set("artist", e.artist);
  if (e.placeName) params.set("placeName", e.placeName);
  if (e.openingDatetime) params.set("openingDatetime", e.openingDatetime);
  params.set("openingTimeConfirmed", String(e.openingTimeConfirmed));
  if (e.runEndDate) params.set("runEndDate", e.runEndDate);
  return `${SITE_URL}/api/social/flyer?${params.toString()}`;
}

export interface RunDeps {
  supabase?: SupabaseClient<Database>;
  now?: Date;
  instagramConfig?: InstagramClientConfig;
  publishInstagramCarouselFn?: typeof publishInstagramCarousel;
  verifyInstagramAccountFn?: typeof verifyInstagramAccount;
  // Test-and-verify support, 2026-08-23: lets a manual workflow_dispatch
  // run the full real pipeline (real Supabase query, real selection, real
  // flyer URLs against production data, real Instagram credentials
  // checked) WITHOUT actually calling the Graph API's publish step or
  // writing social_post_log rows — so the setup can be verified end to
  // end on a day that wouldn't otherwise post anything, without risking a
  // real post going out wrong. Defaults straight from env so the
  // workflow's own inputs can drive it without needing a code change to
  // exercise.
  dryRun?: boolean;
  forceTypes?: SocialPostType[];
}

export async function run(deps: RunDeps = {}): Promise<void> {
  const now = deps.now ?? new Date();
  const today = todayInSantiago(now);
  const publish = deps.publishInstagramCarouselFn ?? publishInstagramCarousel;
  const dryRun = deps.dryRun ?? process.env.DRY_RUN === "true";
  const forceTypes = deps.forceTypes ?? (process.env.FORCE_TYPES?.split(",").filter(Boolean) as SocialPostType[] | undefined);

  // Checked before touching Supabase or Instagram credentials at all —
  // most days are a no-op by design (see scheduledTypesFor), and neither
  // needs to be configured/reachable just to determine that. Real bug,
  // found writing this test: getSupabaseClient() used to run first
  // unconditionally, so a no-op day still required SUPABASE_URL/
  // SUPABASE_SERVICE_ROLE_KEY to be set or it would throw before ever
  // reaching the "nothing scheduled" check.
  const types = forceTypes && forceTypes.length > 0 ? forceTypes : scheduledTypesFor(now);
  if (types.length === 0) {
    console.log(`[social-publish] ${today} — nothing scheduled today, exiting.`);
    return;
  }

  const supabase = deps.supabase ?? getSupabaseClient();
  const week = weekBoundsInSantiago(now);

  const igBusinessAccountId = deps.instagramConfig?.igBusinessAccountId ?? process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = deps.instagramConfig?.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!igBusinessAccountId || !accessToken) {
    throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID and INSTAGRAM_ACCESS_TOKEN must be set.");
  }
  const instagramConfig: InstagramClientConfig = { igBusinessAccountId, accessToken };

  if (dryRun) {
    const verify = deps.verifyInstagramAccountFn ?? verifyInstagramAccount;
    const account = await verify(instagramConfig);
    console.log(`[social-publish] DRY RUN — Instagram credentials verified: @${account.username} (${account.mediaCount} posts).`);
  }

  const [eventsRes, regionsRes, logRes] = await Promise.all([
    supabase.from("events").select("*").eq("curation_status", "approved").is("removed_at", null),
    supabase.from("regions").select("id, name, admin_region_name"),
    // All-time, not just this week — selectDestacada needs each event's
    // full posting history to know how long it's been since it was last
    // featured, not just whether it was featured this week.
    supabase.from("social_post_log").select("event_id, post_type, posted_at, week_start"),
  ]);
  if (eventsRes.error) throw new Error(`Failed to load events: ${eventsRes.error.message}`);
  if (regionsRes.error) throw new Error(`Failed to load regions: ${regionsRes.error.message}`);
  if (logRes.error) throw new Error(`Failed to load social_post_log: ${logRes.error.message}`);

  const regionById = new Map((regionsRes.data ?? []).map((r) => [r.id, r]));
  const events: EventWithRegion[] = ((eventsRes.data ?? []) as EventRow[]).map((e) => {
    const region = e.region_id ? regionById.get(e.region_id) : undefined;
    return { ...e, comunaName: region?.name ?? null };
  });
  const comunaAndRegionById = new Map(
    events.map((e) => {
      const region = e.region_id ? regionById.get(e.region_id) : undefined;
      const comuna = region?.name;
      const adminRegion = region?.admin_region_name;
      return [e.id, [comuna, adminRegion].filter(Boolean).join(", ") || e.freeform_location];
    }),
  );
  const socialEvents = events.map(toSocialEvent);

  const logRows = logRes.data ?? [];
  const alreadyPostedThisWeek = new Map<SocialPostType, Set<string>>([
    ["no_te_la_pierdas", new Set(logRows.filter((r) => r.post_type === "no_te_la_pierdas" && r.week_start === week.start).map((r) => r.event_id))],
    ["destacada", new Set(logRows.filter((r) => r.post_type === "destacada" && r.week_start === week.start).map((r) => r.event_id))],
  ]);
  const lastFeaturedAsDestacada = new Map<string, string>();
  for (const row of logRows) {
    if (row.post_type !== "destacada") continue;
    const current = lastFeaturedAsDestacada.get(row.event_id);
    if (!current || row.posted_at > current) lastFeaturedAsDestacada.set(row.event_id, row.posted_at);
  }

  for (const type of types) {
    const selected =
      type === "inauguracion"
        ? selectInauguraciones(socialEvents, week)
        : type === "no_te_la_pierdas"
          ? selectNoTeLaPierdas(socialEvents, today, week, alreadyPostedThisWeek.get("no_te_la_pierdas")!)
          : selectDestacada(socialEvents, today, alreadyPostedThisWeek.get("destacada")!, lastFeaturedAsDestacada);

    if (selected.length === 0) {
      console.log(`[social-publish] ${type}: nothing eligible today, skipping.`);
      continue;
    }

    // Reserve one slot for the fixed closing slide — carousels cap at 10
    // total on Instagram's side, not 10 dynamic + 1 static.
    const dynamicSlides = selected.slice(0, 9);
    const imageUrls = [...dynamicSlides.map((e) => buildFlyerUrl(type, e, comunaAndRegionById.get(e.id) ?? "")), CLOSING_SLIDE_URL];

    if (dryRun) {
      console.log(
        `[social-publish] DRY RUN — ${type}: would publish a carousel with ${dynamicSlides.length} event(s) + closing slide.\n` +
          `  caption: ${CAPTIONS[type]}\n` +
          imageUrls.map((url, i) => `  [${i + 1}/${imageUrls.length}] ${url}`).join("\n"),
      );
      continue;
    }

    console.log(`[social-publish] ${type}: publishing a carousel with ${dynamicSlides.length} event(s) + closing slide.`);
    const publishedId = await publish(instagramConfig, imageUrls, CAPTIONS[type]);
    console.log(`[social-publish] ${type}: published, Instagram media id ${publishedId}.`);

    if (type !== "inauguracion") {
      const rows = dynamicSlides.map((e) => ({ event_id: e.id, post_type: type, week_start: week.start }));
      const { error } = await supabase.from("social_post_log").insert(rows);
      if (error) console.error(`[social-publish] ${type}: published successfully but failed to log de-dup rows: ${error.message}`);
    }
  }
}
