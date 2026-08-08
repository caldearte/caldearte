import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Real brand favicon (2026-08-08, user-provided design) — magenta "C" on
// sage, the same two tokens as everywhere else in the app
// (--color-brand-magenta/--color-surface-sage, globals.css), in the
// site's real logo font (Lato Black — Header.tsx's own "font-lato
// font-black" wordmark). Replaces the old dark-pill placeholder this
// file's own comment used to describe as provisional.
//
// Satori (the renderer behind ImageResponse) can't see next/font's own
// self-hosted Lato — that's wired into normal DOM rendering, not
// available here — so `fontWeight: 900` alone silently fell back to a
// thin default font the first time this shipped (real bug, caught by the
// user comparing against their reference image). Fixed by loading actual
// Lato Black font bytes via the `fonts` option, the officially
// recommended approach (see next/dist/docs/.../image-response.md's own
// "Custom fonts" example). `assets/lato-black-C.ttf` is a real Lato
// Black (weight 900) TTF, subsetted to just the "C" glyph via Google
// Fonts' own CSS2 API (`?family=Lato:wght@900&text=C`) — ~4KB, since
// this icon only ever renders that one character.
export default async function Icon() {
  const latoBlack = await readFile(join(process.cwd(), "assets/lato-black-C.ttf"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#d7dfe2",
          color: "#ff00fb",
          fontSize: 24,
          fontFamily: "Lato",
          fontWeight: 900,
          borderRadius: 6,
        }}
      >
        C
      </div>
    ),
    { ...size, fonts: [{ name: "Lato", data: latoBlack, weight: 900, style: "normal" }] },
  );
}
