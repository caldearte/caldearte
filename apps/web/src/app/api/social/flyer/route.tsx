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
  const location = searchParams.get("location");
  const imageUrl = searchParams.get("imageUrl");
  if (!title || !location || !imageUrl) {
    return new Response("Missing required params: title, location, imageUrl", { status: 400 });
  }

  const input: FlyerEventInput = {
    type,
    title,
    artist: searchParams.get("artist"),
    placeName: searchParams.get("placeName"),
    location,
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
    return new ImageResponse(<FlyerImage input={input} logoDataUri={logoDataUri} />, {
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
