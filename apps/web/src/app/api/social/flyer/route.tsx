import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FLYER_HEIGHT, FLYER_WIDTH, FlyerImage, type FlyerEventInput, type FlyerType } from "@/lib/social/flyer";
// Preview-only v2 template (see flyer-v2.tsx's own doc comment) — opt-in via
// `?v=2`, never the default, so every existing caller (the cron + the
// manual "Compartir" feature) keeps rendering the current production
// template unchanged.
import { FlyerImageV2 } from "@/lib/social/flyer-v2";

// Called by the automated Instagram-publishing cron over HTTP
// (apps/curator/src/social-publish/run.ts) and by the manual "Compartir"
// carousel feature (apps/web/src/lib/social/shareInauguracionesCarousel.ts)
// — deliberately a plain query-param GET rather than fetching the event by
// id itself: both callers already have the full event record from their
// own Supabase query, so this route stays a pure renderer (title/date-line
// formatting only) instead of a second place that talks to the DB.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

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
    const photoRes = await fetch(imageUrl, { headers: { Accept: "image/jpeg,image/png,image/gif" } });
    if (!photoRes.ok) throw new Error(`Failed to fetch event photo (${photoRes.status}): ${imageUrl}`);
    const photoContentType = photoRes.headers.get("content-type") ?? "image/jpeg";
    if (!photoContentType.startsWith("image/") || photoContentType.includes("webp")) {
      throw new Error(`Event photo resolved to an unsupported content-type (${photoContentType}): ${imageUrl}`);
    }
    const photoBuffer = Buffer.from(await photoRes.arrayBuffer());
    const photoDataUri = `data:${photoContentType};base64,${photoBuffer.toString("base64")}`;

    const useV2 = searchParams.get("v") === "2";
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
