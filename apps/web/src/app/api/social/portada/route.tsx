import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FLYER_HEIGHT, FLYER_WIDTH } from "@/lib/social/flyer";

// The cover slide of the weekend's two agenda carousels
// (apps/curator/src/social-publish/run.ts) — Daniel 2026-10-23: one
// carousel for Santiago and one for regiones, posted Thursday evening, and
// "que se entienda que uno es de Santiago y otro de regiones, para que no
// hayan dudas". It's the first slide, so it's also the thumbnail the feed
// shows. Same look as the closing slide (ig-post-cierre): the dark field
// with the magenta headline, the sage band with CALDEARTE.COM.
//
// Public and unauthenticated like /api/social/flyer, so it takes no free
// text at all: `zona` is one of 2 keys, `desde`/`hasta` plain dates.
const ZONA: Record<string, { name: string; detail: string }> = {
  santiago: { name: "SANTIAGO.", detail: "REGIÓN METROPOLITANA" },
  regiones: { name: "REGIONES.", detail: "FUERA DE SANTIAGO, DE NORTE A SUR" },
};

const WEEKDAYS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

const MAGENTA = "#ff00fb";
const DARK = "#3a343a";
const SAGE = "#d7dfe2";
const LIGHT = "#d7dfe2";

// "VIE 30 OCT" — a plain YYYY-MM-DD, read as a calendar date (no time zone).
function fmtDay(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${WEEKDAYS[dt.getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zona = ZONA[searchParams.get("zona") ?? ""];
  if (!zona) return new Response("'zona' must be one of: santiago, regiones", { status: 400 });
  const desde = fmtDay(searchParams.get("desde") ?? "");
  const hasta = fmtDay(searchParams.get("hasta") ?? "");
  if (!desde || !hasta) return new Response("'desde' and 'hasta' must be dates (YYYY-MM-DD)", { status: 400 });

  const [latoBlack, latoBold] = await Promise.all([
    readFile(join(process.cwd(), "assets/lato-black.ttf")),
    readFile(join(process.cwd(), "assets/lato-bold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: FLYER_WIDTH, height: FLYER_HEIGHT, backgroundColor: DARK }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "150px 80px 0 130px" }}>
          <div style={{ display: "flex", flexDirection: "column", fontFamily: "Lato", fontWeight: 900, fontSize: 150, lineHeight: 1.02, color: MAGENTA }}>
            <div style={{ display: "flex" }}>ESTE</div>
            <div style={{ display: "flex" }}>FINDE EN</div>
            <div style={{ display: "flex" }}>{zona.name}</div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 70,
              fontFamily: "Lato",
              fontWeight: 700,
              fontSize: 44,
              lineHeight: 1.25,
              color: LIGHT,
            }}
          >
            <div style={{ display: "flex" }}>{`${desde} — ${hasta}`}</div>
            <div style={{ display: "flex" }}>{zona.detail}</div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: 296,
            backgroundColor: SAGE,
            padding: "0 150px 0 130px",
            fontFamily: "Lato",
            fontWeight: 700,
            fontSize: 36,
          }}
        >
          <div style={{ display: "flex", color: DARK }}>INAUGURACIONES Y VISITAS GUIADAS</div>
          <div style={{ display: "flex", color: MAGENTA, fontWeight: 900, fontSize: 72 }}>→</div>
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
