import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Real brand favicon (2026-08-08, user-provided design) — magenta "C" on
// sage, the same two tokens as everywhere else in the app
// (--color-brand-magenta/--color-surface-sage, globals.css). Replaces the
// old dark-pill placeholder this file's own comment used to describe as
// provisional.
export default function Icon() {
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
          fontWeight: 900,
          borderRadius: 6,
        }}
      >
        C
      </div>
    ),
    { ...size },
  );
}
