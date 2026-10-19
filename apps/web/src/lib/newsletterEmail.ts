// Shared look for the emails apps/web sends to newsletter subscribers
// (the double opt-in confirmation and the welcome email). Same brand as
// the Thursday edition itself (apps/curator/src/lib/notify.ts's
// buildDigestHtmlBody, 2026-10-18): sage page, magenta CALDE/ARTE.
// wordmark in Lato 900, the site's slogan, a white card. Duplicated as
// literal values rather than imported — apps/curator is a separate
// package, and email HTML can't use the site's CSS variables anyway.

export const SITE_URL = "https://www.caldearte.com";
export const INSTAGRAM_URL = "https://www.instagram.com/caldearte.oficial/";
export const BRAND_MAGENTA = "#ff00fb";
export const SURFACE_SAGE = "#d7dfe2";
export const TEXT_PRIMARY = "#3d373d";
export const TEXT_SECONDARY = "#767f82";
export const LATO_STACK = "'Lato',Helvetica,Arial,sans-serif";
export const SLOGAN = "EL ARTE MÁS CERCA";

export function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Same page as notify.ts's unsubscribeUrl — the subscriber's confirm_token
// doubles as their unsubscribe token.
export function unsubscribeUrl(token: string): string {
  return `${SITE_URL}/newsletter/baja?token=${encodeURIComponent(token)}`;
}

// `bodyHtml` goes inside the white card; `afterHtml` (optional) sits below
// it on the sage page — the welcome email's event rows, which are white
// cards themselves and would vanish on white.
export function emailShell(bodyHtml: string, afterHtml = ""): string {
  return `<!doctype html>
<html lang="es-CL">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://fonts.googleapis.com/css2?family=Lato:wght@900&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background:${SURFACE_SAGE};">
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 20px 32px;background:${SURFACE_SAGE};">
      <a href="${SITE_URL}" style="display:block;text-decoration:none;color:${BRAND_MAGENTA};font-family:${LATO_STACK};font-weight:900;font-size:48px;line-height:0.92;">
        <span style="display:block;">CALDE</span>
        <span style="display:block;">ARTE.</span>
      </a>
      <p style="margin:14px 0 24px;color:${TEXT_PRIMARY};font-family:${LATO_STACK};font-weight:900;font-size:20px;">${SLOGAN}</p>
      <div style="background:#fff;border-radius:22px;padding:28px 24px;">
        ${bodyHtml}
      </div>
      ${afterHtml}
    </div>
  </body>
</html>`;
}
