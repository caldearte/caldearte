import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FLYER_HEIGHT, FLYER_WIDTH, FlyerImage, type FlyerEventInput, type FlyerType } from "@/lib/social/flyer";
import { todayInSantiago } from "@/lib/date";

// Called by the (not-yet-built) Instagram-publishing cron over HTTP —
// deliberately a plain query-param GET rather than fetching the event by
// id itself: the cron already has the full EventRecord from its own
// Supabase query, so this route stays a pure renderer (title/date-line
// formatting only) instead of a second place that talks to the DB.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const type = searchParams.get("type") as FlyerType | null;
  if (type !== "inauguracion" && type !== "no_te_la_pierdas" && type !== "destacada") {
    return new Response("Invalid or missing 'type' (inauguracion | no_te_la_pierdas | destacada)", { status: 400 });
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
    runEndDate: searchParams.get("runEndDate"),
    todayStr: todayInSantiago(),
  };

  const [latoBold, latoBlack, geistSemiBold, logoSvg] = await Promise.all([
    readFile(join(process.cwd(), "assets/lato-bold.ttf")),
    readFile(join(process.cwd(), "assets/lato-black.ttf")),
    readFile(join(process.cwd(), "assets/geist-semibold.ttf")),
    readFile(join(process.cwd(), "assets/logo-caldearte.svg")),
  ]);
  // Data URI, not a remote src — the vector logo is a fixed local asset
  // (unlike the event photo), so there's no reason to add a network round
  // trip or a dependency on Figma's own (temporary) asset host.
  const logoDataUri = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;

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

    return new ImageResponse(<FlyerImage input={input} logoDataUri={logoDataUri} photoDataUri={photoDataUri} />, {
      width: FLYER_WIDTH,
      height: FLYER_HEIGHT,
      fonts: [
        { name: "Lato", data: latoBold, weight: 700, style: "normal" },
        { name: "Lato", data: latoBlack, weight: 900, style: "normal" },
        { name: "Geist", data: geistSemiBold, weight: 600, style: "normal" },
      ],
    });
  } catch (e) {
    return new Response(`Failed to generate flyer: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
