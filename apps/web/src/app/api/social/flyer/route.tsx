import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FLYER_HEIGHT, FLYER_WIDTH, FlyerImage, type FlyerEventInput, type FlyerType } from "@/lib/social/flyer";
// v2 template (see flyer-v2.tsx's own doc comment) — the DEFAULT as of
// 2026-09-06 (Daniel: "deja v2 listo para que el próximo post real ya
// tenga el template nuevo"), after v2 was already merged and tested
// against ~25 real events. Neither real caller (the publishing cron nor
// the manual "Compartir" feature) passes `v` at all, so this flip is what
// actually switches their real output — `?v=1` is kept as an explicit
// escape hatch back to the old template, not the other way around.
import { FlyerImageV2 } from "@/lib/social/flyer-v2";
import { checkFlyerParamLengths, fetchFlyerPhoto, parsePublicImageUrl } from "@/lib/social/flyerRequest";
import { getSupabaseClient } from "@/lib/supabase-client";

// Called by the automated Instagram-publishing cron over HTTP
// (apps/curator/src/social-publish/run.ts) and by the manual "Compartir"
// carousel feature (apps/web/src/lib/social/shareInauguracionesCarousel.ts)
// — deliberately a plain query-param GET rather than fetching the event by
// id itself: both callers already have the full event record from their
// own Supabase query, so the text fields are rendered as passed.
//
// The one exception, since 2026-10-04: the photo. The route is public and
// downloads the photo server-side, so a raw `imageUrl` param would let
// anyone make the server fetch any URL (CodeQL js/request-forgery). It now
// only downloads a URL that is the image of a published event, read back
// from events_public, which both real callers always pass anyway.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const lengthError = checkFlyerParamLengths(searchParams);
  if (lengthError) return new Response(lengthError, { status: 400 });

  const type = searchParams.get("type") as FlyerType | null;
  if (type !== "inauguracion" && type !== "visita_guiada") {
    return new Response("Invalid or missing 'type' (inauguracion | visita_guiada)", { status: 400 });
  }
  const title = searchParams.get("title");
  const region = searchParams.get("region");
  const imageUrl = searchParams.get("imageUrl");
  if (!title || !region || !imageUrl) {
    return new Response("Missing required params: title, region, imageUrl", { status: 400 });
  }
  if (!parsePublicImageUrl(imageUrl)) {
    return new Response("'imageUrl' must be a public https URL", { status: 400 });
  }
  const { data: published, error: lookupError } = await getSupabaseClient()
    .from("events_public")
    .select("image_url")
    .eq("image_url", imageUrl)
    .limit(1);
  if (lookupError) return new Response("Could not verify 'imageUrl'", { status: 503 });
  const publishedImageUrl = published?.[0]?.image_url;
  if (!publishedImageUrl) {
    return new Response("'imageUrl' is not the image of a published event", { status: 400 });
  }

  const input: FlyerEventInput = {
    type,
    title,
    artist: searchParams.get("artist"),
    placeName: searchParams.get("placeName"),
    comuna: searchParams.get("comuna"),
    region,
    imageUrl,
    openingDatetime: searchParams.get("openingDatetime"),
    openingTimeConfirmed: searchParams.get("openingTimeConfirmed") !== "false",
  };

  const [latoBold, latoBlack, geistSemiBold, logoSvg, avatarPng] = await Promise.all([
    readFile(join(process.cwd(), "assets/lato-bold.ttf")),
    readFile(join(process.cwd(), "assets/lato-black.ttf")),
    readFile(join(process.cwd(), "assets/geist-semibold.ttf")),
    readFile(join(process.cwd(), "assets/logo-caldearte.svg")),
    // v2 template only — the real round Instagram-profile-style avatar
    // Daniel provided 2026-09-05, replacing flyer-v2.tsx's earlier JSX
    // approximation (a plain circle with hand-drawn "CALDE"/"ARTE." text).
    readFile(join(process.cwd(), "assets/avatar-caldearte.png")),
  ]);
  // Data URI, not a remote src — the vector logo is a fixed local asset
  // (unlike the event photo), so there's no reason to add a network round
  // trip or a dependency on Figma's own (temporary) asset host.
  const logoDataUri = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;
  const avatarDataUri = `data:image/png;base64,${avatarPng.toString("base64")}`;

  try {
    // Fetched here, with an explicit Accept header, rather than handed to
    // Satori as a remote <img src> for it to fetch itself — real bug,
    // found in a real "destacada" post 2026-08-23: images.squarespace-cdn.com
    // serves auto-negotiated WebP (which Satori can't decode — same root
    // cause as the .webp-extension exclusion in selection.ts) whenever the
    // request's Accept header is permissive, even for a URL ending in
    // ".jpg" — exactly what Satori's own internal fetch apparently sends.
    // Requesting only jpeg/png/gif ourselves sidesteps that CDN's format
    // negotiation entirely, regardless of what any other CDN might do.
    // fetchFlyerPhoto (flyerRequest.ts) keeps that Accept header and adds a
    // timeout, a size cap and per-hop vetting of redirects (2026-10-04).
    // It gets the URL read back from the database, never the raw param.
    const { buffer: photoBuffer, contentType: photoContentType } = await fetchFlyerPhoto(publishedImageUrl);
    const photoDataUri = `data:${photoContentType};base64,${photoBuffer.toString("base64")}`;

    const useV2 = searchParams.get("v") !== "1";
    return new ImageResponse(
      useV2 ? (
        <FlyerImageV2 input={input} photoDataUri={photoDataUri} avatarDataUri={avatarDataUri} />
      ) : (
        <FlyerImage input={input} logoDataUri={logoDataUri} photoDataUri={photoDataUri} />
      ),
      {
        width: FLYER_WIDTH,
        height: FLYER_HEIGHT,
        fonts: [
          { name: "Lato", data: latoBold, weight: 700, style: "normal" },
          { name: "Lato", data: latoBlack, weight: 900, style: "normal" },
          { name: "Geist", data: geistSemiBold, weight: 600, style: "normal" },
        ],
      },
    );
  } catch (e) {
    return new Response(`Failed to generate flyer: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
