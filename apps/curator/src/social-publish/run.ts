// Instagram automated-post cron (docs/roadmap.md, Fase 4 — redesigned
// 2026-08-31 into a single "agenda" carousel, Camila's "bitácora" request:
// no repeats, mixed inauguraciones+visitas guiadas, short non-overlapping
// date windows instead of one big weekly dump). Runs daily; most days it's
// a no-op — only Monday/Wednesday/Friday post, and only if their window
// actually has something eligible. Wires together the single pure selector
// (./selection.ts), the flyer renderer (apps/web's /api/social/flyer,
// deployed and publicly reachable — Instagram's Graph API fetches
// image_url itself server-side, so no image upload step is needed here),
// the static closing-slide asset, and the Graph API publish flow
// (./instagram.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@caldearte/shared-types";
import { getSupabaseClient } from "../lib/supabase-client.js";
import { shortRegionName } from "../lib/regionNames.js";
import { selectUpcoming, type SocialEvent } from "./selection.js";
import { publishInstagramCarousel, verifyInstagramAccount, type InstagramClientConfig } from "./instagram.js";

const SITE_URL = "https://www.caldearte.com";
const CLOSING_SLIDE_URL = `${SITE_URL}/social/ig-post-cierre.png`;

// Keyword-first opener (2026-08-23) — Instagram's own discovery model reads
// caption text (the first line especially) to decide who a post is for,
// now that hashtags are mostly a categorization signal rather than a real
// discovery lever (Mosseri, 2026). "Chile" stays fixed since every
// carousel is nationwide, not comuna-specific — which comunas show up
// changes carousel to carousel (diversifyByComuna), so a caption can't
// name one without being wrong most days. "Próximos días" (not "esta
// semana") since a window is now 2-3 days, never the whole week.
const CAPTION =
  "Esto se viene en los próximos días: inauguraciones y visitas guiadas de arte en Chile — Santiago y regiones. Desliza para ver todas — la agenda completa está en el link de la bio.";

type EventRow = Tables<"events">;
type EventWithRegion = EventRow & { comunaName: string | null };

function todayInSantiago(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Only used for instagram_posts/social_post_log's week_start column
// (kept for historical-record consistency with pre-redesign rows and
// instagram-insights' weekly grouping) — the actual posting-window logic
// above never needs "which Monday" at all anymore.
function mondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const isoDow = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay(); // Mon=1..Sun=7
  dt.setUTCDate(dt.getUTCDate() - (isoDow - 1));
  return dt.toISOString().slice(0, 10);
}

// The 3 fixed posting days and their (non-overlapping) date windows —
// Camila's "bitácora" redesign, 2026-08-31: Monday covers Monday+Tuesday,
// Wednesday covers Wednesday+Thursday, Friday covers Friday through
// Sunday (the widest window, since real data shows weekends carry most of
// the week's volume — see the plan doc this commit implements). Every
// other day is a deliberate no-op, not a bug — and even on a posting day,
// an empty window still results in no post at all (checked by the caller
// via selectUpcoming's return length), by design: no filler content.
function postingWindowFor(now: Date): { start: string; end: string } | null {
  const dow = new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", weekday: "short" }).format(now);
  const today = todayInSantiago(now);
  switch (dow) {
    case "Mon":
    case "Wed":
      return { start: today, end: addDays(today, 1) };
    case "Fri":
      return { start: today, end: addDays(today, 2) };
    default:
      return null;
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
    // Same fallback posture as discover.ts's own eventType default — a
    // row with a real event_type always wins; this only covers a stale
    // row somehow missing the column value.
    eventType: (e.event_type as SocialEvent["eventType"] | null) ?? (e.opening_datetime ? "inauguracion" : "exposicion"),
    sourceAccount: e.source_account,
    artistInstagramHandle: e.artist_instagram_handle,
  };
}

// Appends an @mention line for every distinct Instagram-sourced venue AND
// artist in this carousel — Daniel 2026-08-23 (venue), extended
// 2026-08-25 to artists after a real signal: a tagged venue resshared and
// got a real reply, and the post's ARTIST (never tagged) still liked and
// thanked it publicly, unprompted, on their own. Both give the tagged
// account a real incentive to reshare to their own audience, which a
// caption with no tag doesn't give them. Venue and artist handles are
// deliberately kept in ONE combined, deduped list (not two separate
// lines) — a carousel where the same account is both the venue AND
// tagged as the artist (a solo-practice space) would otherwise repeat
// itself. Only ever set for the Instagram pipeline, so a carousel with
// neither produces the base caption unchanged.
function withVenueMentions(caption: string, events: SocialEvent[]): string {
  const handles = [
    ...new Set(events.flatMap((e) => [e.sourceAccount, e.artistInstagramHandle]).filter((h): h is string => Boolean(h))),
  ];
  if (handles.length === 0) return caption;
  return `${caption}\n\nCon: ${handles.map((h) => `@${h}`).join(" ")}`;
}

// `type` comes from the EVENT's own eventType, not a post-level concept —
// a single carousel now mixes inauguracion and visita_guiada slides, so
// each needs its own flyer label rather than sharing one for the whole post.
function buildFlyerUrl(e: SocialEvent, comunaAndRegion: { comuna: string | null; region: string }): string {
  const flyerType = e.eventType === "visita_guiada" ? "visita_guiada" : "inauguracion";
  const params = new URLSearchParams({
    type: flyerType,
    title: e.title,
    region: comunaAndRegion.region,
    imageUrl: e.imageUrl ?? "",
  });
  if (comunaAndRegion.comuna) params.set("comuna", comunaAndRegion.comuna);
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
  // Manual-testing escape hatch (env FORCE_WINDOW_START/FORCE_WINDOW_END) —
  // lets a workflow_dispatch dry run exercise the full pipeline (real
  // query, real selection, real flyer URLs, real credentials checked) on a
  // day that wouldn't otherwise post anything, without needing a code
  // change. Replaces the old forceTypes mechanism now that there's only
  // one carousel "type" — what used to vary was WHICH type posted, now
  // it's WHICH WINDOW is being tested.
  forceWindow?: { start: string; end: string };
}

export async function run(deps: RunDeps = {}): Promise<void> {
  const now = deps.now ?? new Date();
  const today = todayInSantiago(now);
  const publish = deps.publishInstagramCarouselFn ?? publishInstagramCarousel;
  const dryRun = deps.dryRun ?? process.env.DRY_RUN === "true";
  const forceWindow =
    deps.forceWindow ??
    (process.env.FORCE_WINDOW_START && process.env.FORCE_WINDOW_END
      ? { start: process.env.FORCE_WINDOW_START, end: process.env.FORCE_WINDOW_END }
      : undefined);

  // Checked before touching Supabase or Instagram credentials at all —
  // most days are a no-op by design (see postingWindowFor), and neither
  // needs to be configured/reachable just to determine that. Real bug,
  // found writing this test: getSupabaseClient() used to run first
  // unconditionally, so a no-op day still required SUPABASE_URL/
  // SUPABASE_SERVICE_ROLE_KEY to be set or it would throw before ever
  // reaching the "nothing scheduled" check.
  const window = forceWindow ?? postingWindowFor(now);
  if (!window) {
    console.log(`[social-publish] ${today} — nothing scheduled today, exiting.`);
    return;
  }

  const supabase = deps.supabase ?? getSupabaseClient();

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

  // Retried a few times with backoff (2026-09-02: a scheduled run failed
  // outright on a transient "JWT issued at future" error from Supabase's
  // auth validation — same service role key worked fine hours earlier and
  // hours later, so it wasn't a real credential problem). Safe to retry
  // here specifically because nothing has been written or posted to
  // Instagram yet at this point in the run.
  const loadEvents = () =>
    Promise.all([
      supabase.from("events").select("*").eq("curation_status", "approved").is("removed_at", null),
      supabase.from("regions").select("id, name, admin_region_name"),
      // Every row ever logged, regardless of which post_type wrote it
      // (including the old 'no_te_la_pierdas'/'destacada' rows from before
      // this redesign) — an event already shown once should never repeat,
      // full stop, so there's no "this week only" scoping anymore.
      supabase.from("social_post_log").select("event_id"),
    ]);

  let [eventsRes, regionsRes, logRes] = await loadEvents();
  for (let attempt = 1; attempt <= 3 && (eventsRes.error || regionsRes.error || logRes.error); attempt++) {
    const err = eventsRes.error ?? regionsRes.error ?? logRes.error;
    console.warn(`[social-publish] Supabase read failed (attempt ${attempt}/3): ${err?.message}. Retrying...`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    [eventsRes, regionsRes, logRes] = await loadEvents();
  }
  if (eventsRes.error) throw new Error(`Failed to load events: ${eventsRes.error.message}`);
  if (regionsRes.error) throw new Error(`Failed to load regions: ${regionsRes.error.message}`);
  if (logRes.error) throw new Error(`Failed to load social_post_log: ${logRes.error.message}`);

  const regionById = new Map((regionsRes.data ?? []).map((r) => [r.id, r]));
  const events: EventWithRegion[] = ((eventsRes.data ?? []) as EventRow[]).map((e) => {
    const region = e.region_id ? regionById.get(e.region_id) : undefined;
    return { ...e, comunaName: region?.name ?? null };
  });
  // Split, not pre-joined into one "Providencia, Santiago" string — the
  // flyer renders comuna as plain text and región as its own highlighted
  // badge (Daniel 2026-08-23), so they need to travel as separate fields.
  const comunaAndRegionById = new Map<string, { comuna: string | null; region: string }>(
    events.map((e) => {
      const region = e.region_id ? regionById.get(e.region_id) : undefined;
      const comuna = region?.name ?? null;
      const regionLabel = region?.admin_region_name ? shortRegionName(region.admin_region_name) : null;
      return [e.id, { comuna, region: regionLabel ?? comuna ?? e.freeform_location ?? "" }];
    }),
  );
  const socialEvents = events.map(toSocialEvent);

  const alreadyPostedIds = new Set((logRes.data ?? []).map((r) => r.event_id));

  const selected = selectUpcoming(socialEvents, window, alreadyPostedIds);
  if (selected.length === 0) {
    console.log(`[social-publish] ${today}: nothing eligible for ${window.start}..${window.end}, skipping.`);
    return;
  }

  // Reserve one slot for the fixed closing slide — carousels cap at 10
  // total on Instagram's side, not 10 dynamic + 1 static.
  const dynamicSlides = selected.slice(0, 9);
  const imageUrls = [
    ...dynamicSlides.map((e) => buildFlyerUrl(e, comunaAndRegionById.get(e.id) ?? { comuna: null, region: "" })),
    CLOSING_SLIDE_URL,
  ];
  const caption = withVenueMentions(CAPTION, dynamicSlides);

  if (dryRun) {
    console.log(
      `[social-publish] DRY RUN — would publish a carousel with ${dynamicSlides.length} event(s) + closing slide (window ${window.start}..${window.end}).\n` +
        `  caption: ${caption}\n` +
        imageUrls.map((url, i) => `  [${i + 1}/${imageUrls.length}] ${url}`).join("\n"),
    );
    return;
  }

  console.log(`[social-publish] publishing a carousel with ${dynamicSlides.length} event(s) + closing slide (window ${window.start}..${window.end}).`);
  const publishedId = await publish(instagramConfig, imageUrls, caption);
  console.log(`[social-publish] published, Instagram media id ${publishedId}.`);

  // Real engagement data (reach/saved/likes/comments) is filled in later by
  // a separate weekly cron (instagram-insights/run.ts) — this just records
  // that the post exists at all. 'agenda' is the single post_type every
  // publish writes now (see the migration widening this column's check
  // constraint) — the old 3-value distinction doesn't apply once there's
  // only one carousel shape; which events it contained is still visible
  // per-event via social_post_log.
  const weekStart = mondayOfWeek(today);
  const { error: postLogError } = await supabase
    .from("instagram_posts")
    .insert({ media_id: publishedId, post_type: "agenda", week_start: weekStart, published_at: now.toISOString() });
  if (postLogError) console.error(`[social-publish] published successfully but failed to record instagram_posts row: ${postLogError.message}`);

  // Always logged now — no repeats for anything, so there's no "except
  // inauguracion" carve-out anymore (that carve-out is exactly what made
  // the old inauguracion type repeat weekly, which is the behavior this
  // redesign removes). post_type/week_start are kept (columns are NOT
  // NULL) for historical-record consistency with older rows, even though
  // the exclusion check above no longer reads either field.
  const rows = dynamicSlides.map((e) => ({ event_id: e.id, post_type: "agenda", week_start: weekStart }));
  const { error } = await supabase.from("social_post_log").insert(rows);
  if (error) console.error(`[social-publish] published successfully but failed to log de-dup rows: ${error.message}`);
}
