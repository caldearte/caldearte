import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { esCL } from "@/i18n/es-CL";

// Site-wide default link-preview image — applies to every route that
// doesn't define its own (e.g. /agrega-tu-expo, /privacidad, /curatoria,
// the home page). Real gap found 2026-08-31: root layout's openGraph
// metadata never set an `images` field at all, so every link preview
// (Instagram DMs, WhatsApp, etc.) rendered with no image whatsoever —
// only /eventos/[id] had a real image, via its own generateMetadata.
// Statically generated at build time (no request-time data used).
export const alt = "Caldearte";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const [logoSvg, geistSemiBold] = await Promise.all([
    readFile(join(process.cwd(), "assets/logo-caldearte.svg")),
    readFile(join(process.cwd(), "assets/geist-semibold.ttf")),
  ]);
  const logoDataUri = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          background: "#d7dfe2",
        }}
      >
        <img src={logoDataUri} alt="" width={430} height={210} />
        <div
          style={{
            fontFamily: "Geist",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#1c1c1c",
          }}
        >
          {esCL.heroTagline}
        </div>
      </div>
    ),
    { ...size, fonts: [{ name: "Geist", data: geistSemiBold, style: "normal", weight: 600 }] },
  );
}
