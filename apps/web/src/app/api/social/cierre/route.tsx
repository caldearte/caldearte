import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FLYER_HEIGHT, FLYER_WIDTH } from "@/lib/social/flyer";

// The "y N más" closing slide of the automated agenda carousel
// (apps/curator/src/social-publish/run.ts) — Daniel 2026-10-16: a carousel
// holds 9 events, and whatever didn't fit should send people to the site
// instead of silently disappearing. It's the static closing slide
// (public/social/ig-post-cierre.png, copied to assets/ as a JPEG so it's
// traced into the function like the flyer's fonts) with the count stamped
// in the empty bottom band, under CALDEARTE.COM. run.ts still uses the
// static PNG itself when nothing was left out.
//
// Public and unauthenticated like /api/social/flyer, so it takes no free
// text at all: `mas` is a bounded integer, `cuando` one of 4 keys and
// `zona` (optional, the weekend's two carousels — 2026-10-23) one of 2.
const CUANDO_LABEL: Record<string, string> = {
  hoy: "HOY",
  manana: "MAÑANA",
  finde: "ESTE FINDE",
  proximos: "ESTOS DÍAS",
};

const ZONA_LABEL: Record<string, string> = {
  santiago: "EN SANTIAGO",
  regiones: "EN REGIONES",
};

const MAGENTA = "#ff00fb";
const TEXT_PRIMARY = "#3d373d";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const masParam = searchParams.get("mas") ?? "";
  const mas = /^\d{1,3}$/.test(masParam) ? Number(masParam) : NaN;
  if (!(mas >= 1 && mas <= 999)) return new Response("'mas' must be an integer between 1 and 999", { status: 400 });
  const cuando = CUANDO_LABEL[searchParams.get("cuando") ?? ""];
  if (!cuando) return new Response("'cuando' must be one of: hoy, manana, finde, proximos", { status: 400 });
  const zonaParam = searchParams.get("zona");
  const zona = zonaParam === null ? null : ZONA_LABEL[zonaParam];
  if (zona === undefined) return new Response("'zona' must be one of: santiago, regiones", { status: 400 });

  const [background, latoBlack, latoBold] = await Promise.all([
    readFile(join(process.cwd(), "assets/ig-post-cierre.jpg")),
    readFile(join(process.cwd(), "assets/lato-black.ttf")),
    readFile(join(process.cwd(), "assets/lato-bold.ttf")),
  ]);
  const backgroundDataUri = `data:image/jpeg;base64,${background.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: FLYER_WIDTH, height: FLYER_HEIGHT }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>, not next/image */}
        <img src={backgroundDataUri} width={FLYER_WIDTH} height={FLYER_HEIGHT} style={{ position: "absolute", top: 0, left: 0 }} />
        <div
          style={{
            position: "absolute",
            left: 130,
            right: 150,
            top: 1180,
            display: "flex",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", fontFamily: "Lato", fontWeight: 900, fontSize: 112, lineHeight: 1, color: MAGENTA }}>
            {`+${mas}`}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginLeft: 28,
              fontFamily: "Lato",
              fontWeight: 700,
              fontSize: 36,
              lineHeight: 1.15,
              color: TEXT_PRIMARY,
            }}
          >
            <div style={{ display: "flex" }}>{`${mas === 1 ? "EVENTO MÁS" : "EVENTOS MÁS"} ${cuando}`}</div>
            <div style={{ display: "flex" }}>{zona ? `${zona} QUE NO CABEN AQUÍ` : "QUE NO CABEN AQUÍ"}</div>
          </div>
        </div>
      </div>
    ),
    {
      width: FLYER_WIDTH,
      height: FLYER_HEIGHT,
      fonts: [
        { name: "Lato", data: latoBlack, weight: 900, style: "normal" },
        { name: "Lato", data: latoBold, weight: 700, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=86400, immutable" },
    },
  );
}
